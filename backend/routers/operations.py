from datetime import date, datetime
from secrets import token_hex
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.connection import get_db
from models.booking import Booking
from models.farmer import Farmer
from models.operations import (
    DispatchRecord,
    InventoryFacility,
    MandiScan,
    MandiToken,
    QualityRecord,
)
from models.slot import Slot


router = APIRouter(prefix="/operations", tags=["operations"])

DEFAULT_FACILITIES = (
    ("SILO-02", "Wheat (HD-2967)", "Silo Bay #02", 4250, 6000, "Grade A FAQ", 2275, "Today, 08:30 AM"),
    ("SILO-04", "Paddy (PR-114)", "Silo Bay #04", 2890, 5000, "Grade A Fine", 2183, "Today, 09:15 AM"),
    ("SHED-C", "Cotton (Bt)", "Warehouse Shed C", 1280, 1500, "Premium Long Staple", 7020, "Today, 10:00 AM"),
    ("SILO-01", "Mustard (Pusa-31)", "Silo Bay #01", 1140, 3000, "Oil Content 41%", 5650, "Today, 10:45 AM"),
)

CROP_PRICES = {
    "wheat": 2275,
    "paddy": 2183,
    "cotton": 7020,
    "mustard": 5650,
    "bajra": 2500,
    "soybean": 4892,
}

GRADE_FACTORS = {
    "Grade A (FAQ Standard)": 1.0,
    "Grade B (Fair Quality)": 0.95,
    "Grade C (Under-grade)": 0.88,
}


def _token_data(token: MandiToken):
    return {
        "id": token.token_number,
        "farmer": token.farmer_name,
        "phone": token.phone or "",
        "village": token.village or "",
        "crop": token.crop,
        "cropCategory": token.crop.split()[0] if token.crop else "Other",
        "quantity": f"{token.quantity_qtl:g} Qtl",
        "rawQuintals": token.quantity_qtl,
        "slot": token.slot,
        "hourSlot": token.start_time.strftime("%I %p").lstrip("0") if token.start_time else token.slot,
        "status": token.status,
        "moisture": f"{token.moisture:g}%" if token.moisture is not None else "--",
        "grade": token.grade or "Pending Gate Entry",
        "price": f"Rs. {token.base_price_per_qtl:g} / Qtl",
        "basePrice": token.base_price_per_qtl,
        "txHash": "--",
        "vehicle": "Not provided",
        "bookingId": token.source_booking_id,
        "slotDate": token.slot_date.isoformat() if token.slot_date else None,
    }


def _sync_existing_bookings(db: Session):
    synced_booking_ids = {
        booking_id
        for (booking_id,) in db.query(MandiToken.source_booking_id)
        .filter(MandiToken.source_booking_id.isnot(None))
        .all()
    }
    bookings = db.query(Booking).all()

    for booking in bookings:
        if booking.id in synced_booking_ids:
            continue
        farmer = db.query(Farmer).filter(Farmer.id == booking.farmer_id).first()
        slot = db.query(Slot).filter(Slot.id == booking.slot_id).first()
        if not farmer or not slot:
            continue

        token_number = booking.booking_token or f"FC-{booking.id}-{uuid4().hex}"
        if db.query(MandiToken).filter(MandiToken.token_number == token_number).first():
            token_number = f"FC-{booking.id}-{uuid4().hex}"

        db.add(
            MandiToken(
                token_number=token_number,
                source_booking_id=booking.id,
                farmer_id=farmer.id,
                farmer_name=farmer.full_name or "Farmer",
                phone=farmer.phone_number or "",
                crop="Produce details not recorded",
                quantity_qtl=0,
                slot=f"{slot.start_time.strftime('%I:%M %p')} - {slot.end_time.strftime('%I:%M %p')}",
                slot_date=slot.slot_date,
                start_time=slot.start_time,
                status="Waiting",
            )
        )

    if db.new:
        db.commit()


def _facility_data(facility: InventoryFacility):
    return {
        "id": facility.id,
        "crop": facility.crop,
        "silo": facility.silo,
        "current": facility.current_stock,
        "capacity": facility.capacity,
        "grade": facility.grade,
        "mspRate": facility.msp_rate,
        "lastInspected": facility.last_inspected,
    }


class TokenCreate(BaseModel):
    farmer: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=30)
    village: str = Field(default="", max_length=120)
    crop: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0)
    slot: str = Field(min_length=1, max_length=80)
    status: Literal["Waiting", "Gate Verified", "In Inspection", "Paid"] = "Waiting"


class TokenStatusUpdate(BaseModel):
    status: Literal["Waiting", "Gate Verified", "In Inspection", "Quality Complete", "Paid", "Rejected"]


class QualityCreate(BaseModel):
    token_id: str = Field(min_length=1)
    weight: float = Field(gt=0)
    moisture: float = Field(ge=5, le=25)
    foreign_matter: float = Field(ge=0, le=10)
    grade: Literal[
        "Grade A (FAQ Standard)",
        "Grade B (Fair Quality)",
        "Grade C (Under-grade)",
    ]
    inspector_notes: str = Field(default="", max_length=2000)


class DispatchCreate(BaseModel):
    facility_id: str = Field(min_length=1)
    quantity: float = Field(gt=0)
    destination: str = Field(min_length=1, max_length=200)
    truck_number: str = Field(min_length=1, max_length=40)
    driver_name: str = Field(min_length=1, max_length=120)
    driver_phone: str = Field(min_length=1, max_length=30)


@router.get("/tokens")
def get_tokens(db: Session = Depends(get_db)):
    _sync_existing_bookings(db)
    return [
        _token_data(token)
        for token in db.query(MandiToken).order_by(MandiToken.created_at.desc(), MandiToken.id.desc()).all()
    ]


@router.post("/tokens")
def create_token(data: TokenCreate, db: Session = Depends(get_db)):
    existing_numbers = [number for (number,) in db.query(MandiToken.token_number).all()]
    highest = max(
        (int(number.rsplit("-", 1)[-1]) for number in existing_numbers if number.startswith("#AGRI-") and number.rsplit("-", 1)[-1].isdigit()),
        default=8400,
    )
    token = MandiToken(
        token_number=f"#AGRI-{highest + 1}",
        farmer_name=data.farmer.strip(),
        phone=data.phone.strip(),
        village=data.village.strip(),
        crop=data.crop.strip(),
        quantity_qtl=data.quantity,
        slot=data.slot,
        slot_date=date.today(),
        status=data.status,
        base_price_per_qtl=next(
            (price for crop, price in CROP_PRICES.items() if crop in data.crop.lower()),
            2275,
        ),
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return _token_data(token)


@router.put("/tokens/{token_id}/status")
def update_token_status(
    token_id: str,
    data: TokenStatusUpdate,
    db: Session = Depends(get_db),
):
    token = db.query(MandiToken).filter(MandiToken.token_number == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    token.status = data.status
    gate_pass = None
    if data.status in ("Gate Verified", "Rejected"):
        if data.status == "Gate Verified":
            gate_pass = f"#GP-{uuid4().hex[:10].upper()}"
        db.add(
            MandiScan(
                token_id=token.id,
                result="approved" if data.status == "Gate Verified" else "rejected",
                gate_pass=gate_pass,
            )
        )

    db.commit()
    db.refresh(token)
    return {**_token_data(token), "gatePass": gate_pass}


@router.get("/scanner-stats")
def get_scanner_stats(db: Session = Depends(get_db)):
    scans = db.query(MandiScan).filter(MandiScan.scanned_at >= datetime.combine(date.today(), datetime.min.time())).all()
    approved = sum(scan.result == "approved" for scan in scans)
    rejected = sum(scan.result == "rejected" for scan in scans)
    return {
        "scannedToday": approved + rejected,
        "approved": approved,
        "rejected": rejected,
    }


@router.get("/summary")
def get_operations_summary(db: Session = Depends(get_db)):
    quality_stats = db.query(
        func.count(QualityRecord.id),
        func.avg(QualityRecord.moisture),
        func.sum(QualityRecord.total_payout),
    ).one()
    graded_count = db.query(QualityRecord).count()
    grade_a_count = db.query(QualityRecord).filter(
        QualityRecord.grade == "Grade A (FAQ Standard)"
    ).count()
    return {
        "intakeQtl": db.query(func.coalesce(func.sum(MandiToken.quantity_qtl), 0)).scalar(),
        "averageGradeA": round(grade_a_count * 100 / graded_count) if graded_count else 0,
        "averageMoisture": round(quality_stats[1], 1) if quality_stats[1] is not None else None,
        "totalPayout": quality_stats[2] or 0,
        "qualityRecords": quality_stats[0],
    }


@router.get("/quality")
def get_quality_records(db: Session = Depends(get_db)):
    records = (
        db.query(QualityRecord, MandiToken)
        .join(MandiToken, QualityRecord.token_id == MandiToken.id)
        .order_by(QualityRecord.created_at.desc(), QualityRecord.id.desc())
        .all()
    )
    return [
        {
            "id": token.token_number,
            "farmer": token.farmer_name,
            "crop": token.crop,
            "weight": record.weight_qtl,
            "moisture": record.moisture,
            "grade": record.grade,
            "rate": record.rate_per_qtl,
            "totalPayout": record.total_payout,
            "timestamp": record.created_at.strftime("%I:%M %p"),
            "recordId": f"QR-{record.id:06d}",
        }
        for record, token in records
    ]


@router.get("/quality/token/{token_number}")
def get_quality_for_token(token_number: str, db: Session = Depends(get_db)):
    row = (
        db.query(QualityRecord, MandiToken)
        .join(MandiToken, QualityRecord.token_id == MandiToken.id)
        .filter(MandiToken.token_number == token_number)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Quality record not found")
    record, token = row
    return {
        "receiptId": f"REC-{record.id:05d}",
        "tokenNumber": token.token_number,
        "crop": token.crop,
        "quantity": record.weight_qtl,
        "ratePerQuintal": record.rate_per_qtl,
        "totalAmount": record.total_payout,
        "grade": record.grade,
        "moisture": record.moisture,
        "status": token.status,
        "createdAt": record.created_at,
    }


@router.post("/quality")
def create_quality_record(data: QualityCreate, db: Session = Depends(get_db)):
    token = db.query(MandiToken).filter(MandiToken.token_number == data.token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    if db.query(QualityRecord).filter(QualityRecord.token_id == token.id).first():
        raise HTTPException(status_code=409, detail="A quality record already exists for this token")

    grade_multiplier = GRADE_FACTORS[data.grade]
    moisture_dockage = 0 if data.moisture <= 12 else 0.02 if data.moisture <= 14 else 0.05
    rate = round(token.base_price_per_qtl * (grade_multiplier - moisture_dockage))
    record = QualityRecord(
        token_id=token.id,
        weight_qtl=data.weight,
        moisture=data.moisture,
        foreign_matter=data.foreign_matter,
        grade=data.grade,
        rate_per_qtl=rate,
        total_payout=round(data.weight * rate),
        inspector_notes=data.inspector_notes.strip(),
        tx_hash=f"0x{token_hex(16)}",
    )
    token.status = "Quality Complete"
    token.moisture = data.moisture
    token.grade = data.grade
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": token.token_number,
        "farmer": token.farmer_name,
        "crop": token.crop,
        "weight": record.weight_qtl,
        "moisture": record.moisture,
        "grade": record.grade,
        "rate": record.rate_per_qtl,
        "totalPayout": record.total_payout,
        "timestamp": record.created_at.strftime("%I:%M %p"),
        "recordId": f"QR-{record.id:06d}",
    }


@router.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    if db.query(InventoryFacility).count() == 0:
        db.add_all(
            [
                InventoryFacility(
                    id=facility_id,
                    crop=crop,
                    silo=silo,
                    current_stock=current_stock,
                    capacity=capacity,
                    grade=grade,
                    msp_rate=msp_rate,
                    last_inspected=last_inspected,
                )
                for facility_id, crop, silo, current_stock, capacity, grade, msp_rate, last_inspected in DEFAULT_FACILITIES
            ]
        )
        db.commit()
    return [
        _facility_data(facility)
        for facility in db.query(InventoryFacility).order_by(InventoryFacility.id).all()
    ]


@router.get("/dispatches")
def get_dispatches(db: Session = Depends(get_db)):
    rows = (
        db.query(DispatchRecord, InventoryFacility)
        .join(InventoryFacility, DispatchRecord.facility_id == InventoryFacility.id)
        .order_by(DispatchRecord.dispatched_at.desc(), DispatchRecord.id.desc())
        .all()
    )
    return [
        {
            "gatePass": dispatch.gate_pass,
            "crop": facility.crop,
            "from": facility.silo,
            "quantity": dispatch.quantity,
            "destination": dispatch.destination,
            "truck": dispatch.truck_number,
            "timestamp": dispatch.dispatched_at.strftime("%I:%M %p"),
            "status": dispatch.status,
        }
        for dispatch, facility in rows
    ]


@router.post("/dispatches")
def create_dispatch(data: DispatchCreate, db: Session = Depends(get_db)):
    facility = (
        db.query(InventoryFacility)
        .with_for_update()
        .filter(InventoryFacility.id == data.facility_id)
        .first()
    )
    if not facility:
        raise HTTPException(status_code=404, detail="Storage facility not found")
    if data.quantity > facility.current_stock:
        raise HTTPException(status_code=400, detail="Dispatch quantity exceeds available stock")

    facility.current_stock -= data.quantity
    record = DispatchRecord(
        gate_pass=f"#GP-DISP-{uuid4().hex[:12].upper()}",
        facility_id=facility.id,
        quantity=data.quantity,
        destination=data.destination.strip(),
        truck_number=data.truck_number.strip(),
        driver_name=data.driver_name.strip(),
        driver_phone=data.driver_phone.strip(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "gatePass": record.gate_pass,
        "crop": facility.crop,
        "from": facility.silo,
        "quantity": record.quantity,
        "destination": record.destination,
        "truck": record.truck_number,
        "timestamp": record.dispatched_at.strftime("%I:%M %p"),
        "status": record.status,
    }
