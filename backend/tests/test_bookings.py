import os
import sys
import unittest
from datetime import date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from database.connection import Base
from models.booking import Booking
from models.farmer import Farmer
from models.slot import Slot
from routers.farmers import (
    BookingCreate,
    FarmerCreate,
    _get_upcoming_slots,
    create_booking,
    create_farmer,
    get_farmer_queue,
    login_farmer,
    FarmerLogin,
)


class BookingFlowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine)

        with self.session_factory() as db:
            db.add_all(
                [
                    Farmer(id=1, full_name="Farmer One", phone_number="1111111111"),
                    Farmer(id=2, full_name="Farmer Two", phone_number="2222222222"),
                    Slot(
                        id=1,
                        center_id=1,
                        slot_date=date(2026, 12, 1),
                        start_time=time(9, 0),
                        end_time=time(10, 0),
                        max_capacity=2,
                        booked_count=0,
                    ),
                ]
            )
            db.commit()

    def tearDown(self):
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_booking_generates_unique_tokens_and_queue_position(self):
        with self.session_factory() as db:
            first_booking = create_booking(
                BookingCreate(farmer_id=1, slot_id=1),
                db,
            )["booking"]
            second_booking = create_booking(
                BookingCreate(farmer_id=2, slot_id=1),
                db,
            )["booking"]

        self.assertTrue(first_booking["booking_token"])
        self.assertNotEqual(
            first_booking["booking_token"],
            second_booking["booking_token"],
        )

        with self.session_factory() as db:
            queue = get_farmer_queue(2, db)
            self.assertEqual(
                queue["booking_token"],
                second_booking["booking_token"],
            )
            self.assertEqual(queue["farmers_ahead"], 1)
            self.assertGreater(queue["estimated_wait_minutes"], 0)

            with self.assertRaises(HTTPException) as error:
                create_booking(BookingCreate(farmer_id=2, slot_id=1), db)
            self.assertEqual(error.exception.status_code, 400)

    def test_upcoming_slots_are_generated_for_three_daily_windows(self):
        now = datetime(2026, 12, 1, 8, 0)

        with self.session_factory() as db:
            slots = _get_upcoming_slots(db, now)
            self.assertEqual(len(slots), 21)
            self.assertEqual(
                [(slot["start_time"], slot["end_time"]) for slot in slots[:3]],
                [
                    (time(9, 0), time(11, 0)),
                    (time(11, 0), time(13, 0)),
                    (time(14, 0), time(16, 0)),
                ],
            )

            repeated_slots = _get_upcoming_slots(db, now)
            self.assertEqual(len(repeated_slots), 21)
            self.assertEqual(db.query(Slot).count(), 22)

    def test_generated_slot_can_be_booked(self):
        now = datetime.now().replace(
            hour=8,
            minute=0,
            second=0,
            microsecond=0,
        ) + timedelta(days=1)

        with self.session_factory() as db:
            slot = _get_upcoming_slots(db, now)[0]
            booking = create_booking(
                BookingCreate(farmer_id=1, slot_id=slot["id"]),
                db,
            )["booking"]

            self.assertEqual(booking["slot_id"], slot["id"])
            self.assertTrue(booking["booking_token"])

    def test_booking_rejects_expired_slot(self):
        with self.session_factory() as db:
            expired_slot = Slot(
                id=2,
                center_id=1,
                slot_date=date.today() - timedelta(days=1),
                start_time=time(9, 0),
                end_time=time(11, 0),
                max_capacity=20,
                booked_count=0,
            )
            db.add(expired_slot)
            db.commit()

            with self.assertRaises(HTTPException) as error:
                create_booking(BookingCreate(farmer_id=1, slot_id=2), db)

            self.assertEqual(error.exception.status_code, 400)
            self.assertIn("expired", error.exception.detail)

    def test_registration_persists_profile_and_login_returns_it(self):
        registration = FarmerCreate(
            name="Farmer Profile",
            phone="3333333333",
            pin="1234",
            village="Sanganer",
            district="Jaipur",
            land_size="12.5",
        )
        with self.session_factory() as db:
            response = create_farmer(registration, db)
            self.assertEqual(response["farmer"]["village"], "Sanganer")
            login = login_farmer(
                FarmerLogin(phone="3333333333", pin="1234"),
                db,
            )
            self.assertEqual(login["farmer"]["district"], "Jaipur")
            self.assertEqual(login["farmer"]["land_size"], "12.5")


if __name__ == "__main__":
    unittest.main()
