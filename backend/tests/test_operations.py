import os
import sys
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from database.connection import Base
from models.operations import InventoryFacility, MandiScan, MandiToken
from routers.operations import (
    DispatchCreate,
    QualityCreate,
    TokenCreate,
    TokenStatusUpdate,
    create_dispatch,
    create_quality_record,
    create_token,
    get_dispatches,
    get_inventory,
    get_quality_for_token,
    get_scanner_stats,
    update_token_status,
)


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine)

    def tearDown(self):
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_tokens_scans_and_quality_records_persist(self):
        with self.session_factory() as db:
            token = create_token(
                TokenCreate(
                    farmer="Test Farmer",
                    phone="1234567890",
                    village="Test Village",
                    crop="Wheat (HD-2967)",
                    quantity=10,
                    slot="11:15 AM",
                ),
                db,
            )
            token_id = token["id"]

            approval = update_token_status(
                token_id,
                TokenStatusUpdate(status="Gate Verified"),
                db,
            )
            token_record = db.query(MandiToken).filter_by(token_number=token_id).one()
            self.assertTrue(approval["gatePass"].startswith("#GP-"))
            self.assertEqual(
                db.query(MandiScan).filter_by(token_id=token_record.id).one().gate_pass,
                approval["gatePass"],
            )
            self.assertEqual(get_scanner_stats(db), {
                "scannedToday": 1,
                "approved": 1,
                "rejected": 0,
            })

            record = create_quality_record(
                QualityCreate(
                    token_id=token_id,
                    weight=10,
                    moisture=12.5,
                    foreign_matter=0.5,
                    grade="Grade A (FAQ Standard)",
                    inspector_notes="Quality checked",
                ),
                db,
            )
            self.assertEqual(record["rate"], 2230)
            self.assertEqual(record["totalPayout"], 22300)
            self.assertTrue(record["recordId"].startswith("QR-"))
            self.assertEqual(
                get_quality_for_token(token_id, db)["totalAmount"],
                22300,
            )
            self.assertEqual(
                db.query(MandiToken).filter_by(token_number=token_id).one().status,
                "Quality Complete",
            )

            with self.assertRaises(HTTPException) as error:
                create_quality_record(
                    QualityCreate(
                        token_id=token_id,
                        weight=10,
                        moisture=12.5,
                        foreign_matter=0,
                        grade="Grade A (FAQ Standard)",
                    ),
                    db,
                )
            self.assertEqual(error.exception.status_code, 409)

    def test_dispatch_deducts_stock_and_rejects_overspend(self):
        with self.session_factory() as db:
            facilities = get_inventory(db)
            facility = next(item for item in facilities if item["id"] == "SILO-02")
            dispatch = create_dispatch(
                DispatchCreate(
                    facility_id="SILO-02",
                    quantity=250,
                    destination="Test Depot",
                    truck_number="TEST-123",
                    driver_name="Test Driver",
                    driver_phone="1234567890",
                ),
                db,
            )
            self.assertTrue(dispatch["gatePass"])
            self.assertEqual(dispatch["quantity"], 250)
            self.assertEqual(len(get_dispatches(db)), 1)
            self.assertEqual(
                db.query(InventoryFacility).filter_by(id="SILO-02").one().current_stock,
                facility["current"] - 250,
            )

            with self.assertRaises(HTTPException) as error:
                create_dispatch(
                    DispatchCreate(
                        facility_id="SILO-02",
                        quantity=10000,
                        destination="Test Depot",
                        truck_number="TEST-456",
                        driver_name="Test Driver",
                        driver_phone="1234567890",
                    ),
                    db,
                )
            self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
