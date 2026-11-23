from datetime import datetime, date, time, timedelta
from math import ceil
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database.connection import get_db
from models.farmer import Farmer
from models.operations import MandiToken
from security import hash_pin, is_hashed_pin, verify_pin


router = APIRouter()

SLOT_WINDOWS = (
    (time(9, 0), time(11, 0)),
    (time(11, 0), time(13, 0)),
    (time(14, 0), time(16, 0)),
)
SLOT_CAPACITY = 20
BOOKING_WINDOW_DAYS = 7
CROP_BASE_PRICES = {
    "wheat": 2275,
    "paddy": 2183,
    "rice": 2183,
    "cotton": 7020,
    "mustard": 5650,
    "bajra": 2500,
    "soybean": 4892,
}


# =========================
# Farmer Registration
# =========================

class FarmerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(pattern=r"^[0-9]{10}$")
    pin: str = Field(pattern=r"^[0-9]{4}$")
    village: str = Field(default="", max_length=120)
    district: str = Field(default="", max_length=120)
    land_size: str = Field(default="", max_length=40)


@router.post("/farmers")
def create_farmer(
    data: FarmerCreate,
    db: Session = Depends(get_db)
):
    existing_farmer = (
        db.query(Farmer)
        .filter(Farmer.phone_number == data.phone)
        .first()
    )

    if existing_farmer:
        raise HTTPException(
            status_code=400,
            detail="Farmer with this phone number already exists"
        )

    farmer = Farmer(
        full_name=data.name,
        phone_number=data.phone,
        password_hash=hash_pin(data.pin),
        village=data.village.strip(),
        district=data.district.strip(),
        land_size=data.land_size.strip(),
    )

    db.add(farmer)
    db.commit()
    db.refresh(farmer)

    return {
        "message": "Farmer registered successfully",
        "farmer": {
            "id": farmer.id,
            "full_name": farmer.full_name,
            "phone_number": farmer.phone_number,
            "village": farmer.village,
            "district": farmer.district,
            "land_size": farmer.land_size,
        },
    }


# =========================
# Farmer Login
# =========================

class FarmerLogin(BaseModel):
    phone: str = Field(pattern=r"^[0-9]{10}$")
    pin: str = Field(pattern=r"^[0-9]{4}$")


@router.post("/login")
def login_farmer(
    data: FarmerLogin,
    db: Session = Depends(get_db)
):
    farmer = (
        db.query(Farmer)
        .filter(Farmer.phone_number == data.phone)
        .first()
    )

    if not farmer or not verify_pin(data.pin, farmer.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid Phone Number or PIN"
        )

    if not is_hashed_pin(farmer.password_hash):
        farmer.password_hash = hash_pin(data.pin)
        db.commit()

    return {
        "message": "Login successful",
        "farmer": {
            "id": farmer.id,
            "full_name": farmer.full_name,
            "phone_number": farmer.phone_number,
            "village": farmer.village,
            "district": farmer.district,
            "land_size": farmer.land_size,
        },
    }


# =========================
# Create Booking
# =========================

class BookingCreate(BaseModel):
    farmer_id: int
    slot_id: int
    crop: str = Field(default="", max_length=100)
    quantity: float = Field(default=0, ge=0)


@router.post("/bookings")
def create_booking(
    data: BookingCreate,
    db: Session = Depends(get_db)
):
    from models.booking import Booking
    from models.slot import Slot

    farmer = (
        db.query(Farmer)
        .filter(Farmer.id == data.farmer_id)
        .first()
    )

    if not farmer:
        raise HTTPException(
            status_code=404,
            detail="Farmer not found"
        )

    slot = (
        db.query(Slot)
        .with_for_update()
        .filter(Slot.id == data.slot_id)
        .first()
    )

    if not slot:
        raise HTTPException(
            status_code=404,
            detail="Slot not found"
        )

    if datetime.combine(slot.slot_date, slot.start_time) <= datetime.now():
        raise HTTPException(
            status_code=400,
            detail="This slot has expired. Please choose a current arrival slot."
        )

    if (slot.booked_count or 0) >= slot.max_capacity:
        raise HTTPException(
            status_code=400,
            detail="This slot is full"
        )

    unique_token = f"FC-{farmer.id}-{uuid4().hex}"

    booking = Booking(
        farmer_id=farmer.id,
        slot_id=slot.id,
        booking_status="confirmed",
        booking_token=unique_token,
        booked_at=datetime.utcnow(),
    )

    slot.booked_count = (slot.booked_count or 0) + 1

    db.add(booking)
    db.flush()
    crop_name = data.crop.strip()
    base_price = next(
        (price for crop, price in CROP_BASE_PRICES.items() if crop in crop_name.lower()),
        2275,
    )
    db.add(
        MandiToken(
            token_number=unique_token,
            source_booking_id=booking.id,
            farmer_id=farmer.id,
            farmer_name=farmer.full_name or "Farmer",
            phone=farmer.phone_number or "",
            crop=crop_name or "Produce details not recorded",
            quantity_qtl=data.quantity,
            slot=f"{slot.start_time.strftime('%I:%M %p')} - {slot.end_time.strftime('%I:%M %p')}",
            slot_date=slot.slot_date,
            start_time=slot.start_time,
            status="Waiting",
            base_price_per_qtl=base_price,
        )
    )
    db.commit()
    db.refresh(booking)

    return {
        "message": "Booking created successfully",
        "booking": {
            "id": booking.id,
            "farmer_id": booking.farmer_id,
            "slot_id": booking.slot_id,
            "booking_status": booking.booking_status,
            "booking_token": booking.booking_token,
            "booked_at": booking.booked_at,
        },
    }


@router.get("/queue/{farmer_id}")
def get_farmer_queue(
    farmer_id: int,
    db: Session = Depends(get_db)
):
    from models.booking import Booking
    from models.slot import Slot

    booking = (
        db.query(Booking)
        .filter(
            Booking.farmer_id == farmer_id,
            Booking.booking_status == "confirmed",
        )
        .order_by(Booking.booked_at.desc(), Booking.id.desc())
        .first()
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="No active booking found for this farmer"
        )

    slot = db.query(Slot).filter(Slot.id == booking.slot_id).first()
    if not slot:
        raise HTTPException(
            status_code=404,
            detail="The booked slot could not be found"
        )

    farmers_ahead = (
        db.query(Booking)
        .filter(
            Booking.slot_id == booking.slot_id,
            Booking.booking_status == "confirmed",
            or_(
                Booking.booked_at < booking.booked_at,
                and_(
                    Booking.booked_at == booking.booked_at,
                    Booking.id < booking.id,
                ),
            ),
        )
        .count()
    )

    slot_start = datetime.combine(slot.slot_date, slot.start_time)
    slot_end = datetime.combine(slot.slot_date, slot.end_time)
    slot_minutes = max(0, (slot_end - slot_start).total_seconds() / 60)
    minutes_per_farmer = max(1, ceil(slot_minutes / max(slot.max_capacity, 1)))

    return {
        "booking_token": booking.booking_token,
        "status": "In Line",
        "farmers_ahead": farmers_ahead,
        "estimated_wait_minutes": farmers_ahead * minutes_per_farmer,
    }


# =========================
# Get Slots
# =========================

def _get_upcoming_slots(db: Session, now: datetime):
    from models.slot import Slot

    today = now.date()
    last_day = today + timedelta(days=BOOKING_WINDOW_DAYS - 1)
    slots = (
        db.query(Slot)
        .filter(Slot.slot_date >= today, Slot.slot_date <= last_day)
        .all()
    )
    existing_slots = {
        (slot.slot_date, slot.start_time, slot.end_time): slot
        for slot in slots
    }

    for day_offset in range(BOOKING_WINDOW_DAYS):
        slot_date = today + timedelta(days=day_offset)
        for start_time, end_time in SLOT_WINDOWS:
            if (
                slot_date == today
                and datetime.combine(slot_date, start_time) <= now
            ):
                continue

            slot_key = (slot_date, start_time, end_time)
            if slot_key not in existing_slots:
                slot = Slot(
                    center_id=1,
                    slot_date=slot_date,
                    start_time=start_time,
                    end_time=end_time,
                    max_capacity=SLOT_CAPACITY,
                    booked_count=0,
                    created_at=now,
                )
                db.add(slot)
                existing_slots[slot_key] = slot

    if db.new:
        db.commit()
        for slot in existing_slots.values():
            if slot.id is None:
                db.refresh(slot)

    upcoming_slots = []
    for day_offset in range(BOOKING_WINDOW_DAYS):
        slot_date = today + timedelta(days=day_offset)
        for start_time, end_time in SLOT_WINDOWS:
            slot_key = (slot_date, start_time, end_time)
            if slot_key not in existing_slots:
                continue
            if (
                slot_date == today
                and datetime.combine(slot_date, start_time) <= now
            ):
                continue

            slot = existing_slots[slot_key]
            upcoming_slots.append({
                "id": slot.id,
                "center_id": slot.center_id,
                "slot_date": slot.slot_date,
                "start_time": slot.start_time,
                "end_time": slot.end_time,
                "max_capacity": slot.max_capacity,
                "booked_count": slot.booked_count,
                "available": slot.max_capacity - (slot.booked_count or 0),
            })

    return upcoming_slots


@router.get("/slots")
def get_slots(db: Session = Depends(get_db)):
    return _get_upcoming_slots(db, datetime.now())


# =========================
# Get All Bookings
# =========================

@router.get("/bookings")
def get_bookings(db: Session = Depends(get_db)):
    from models.booking import Booking

    bookings = db.query(Booking).all()

    return [
        {
            "id": booking.id,
            "farmer_id": booking.farmer_id,
            "slot_id": booking.slot_id,
            "booking_status": booking.booking_status,
            "booking_token": booking.booking_token,
            "booked_at": booking.booked_at,
        }
        for booking in bookings
    ]


# =========================
# Test: Update Slot Date
# =========================

@router.put("/test-slot-date")
def update_test_slot_date(
    db: Session = Depends(get_db)
):
    from models.slot import Slot

    slot = (
        db.query(Slot)
        .filter(Slot.id == 1)
        .first()
    )

    if not slot:
        raise HTTPException(
            status_code=404,
            detail="Slot not found"
        )

    slot.slot_date = date(2026, 9, 20)

    db.commit()
    db.refresh(slot)

    return {
        "message": "Test slot date updated",
        "slot_id": slot.id,
        "slot_date": slot.slot_date,
    }

# =========================
# Update Booking Status
# =========================

class BookingStatusUpdate(BaseModel):
    status: str


@router.put("/bookings/{booking_id}/status")
def update_booking_status(
    booking_id: int,
    data: BookingStatusUpdate,
    db: Session = Depends(get_db)
):
    from models.booking import Booking

    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id)
        .first()
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found"
        )

    booking.booking_status = data.status

    try:
        db.commit()
        db.refresh(booking)

        return {
            "message": "Booking status updated successfully",
            "booking": {
                "id": booking.id,
                "farmer_id": booking.farmer_id,
                "slot_id": booking.slot_id,
                "booking_status": booking.booking_status,
                "booking_token": booking.booking_token,
                "booked_at": booking.booked_at,
            },
        }

    except Exception as error:
        db.rollback()

        print("STATUS UPDATE ERROR:", repr(error))

        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(error)}"
        )