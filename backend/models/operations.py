from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time

from database.connection import Base


class MandiToken(Base):
    __tablename__ = "mandi_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_number = Column(String, unique=True, nullable=False, index=True)
    source_booking_id = Column(Integer, ForeignKey("bookings.id"), unique=True)
    farmer_id = Column(Integer, ForeignKey("farmers.id"))
    farmer_name = Column(String, nullable=False)
    phone = Column(String, default="")
    village = Column(String, default="")
    crop = Column(String, nullable=False)
    quantity_qtl = Column(Float, nullable=False)
    slot = Column(String, nullable=False)
    slot_date = Column(Date)
    start_time = Column(Time)
    status = Column(String, nullable=False, default="Waiting")
    moisture = Column(Float)
    grade = Column(String)
    base_price_per_qtl = Column(Float, nullable=False, default=2275)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class MandiScan(Base):
    __tablename__ = "mandi_scans"

    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("mandi_tokens.id"), nullable=False)
    result = Column(String, nullable=False)
    gate_pass = Column(String, unique=True)
    scanned_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class QualityRecord(Base):
    __tablename__ = "quality_records"

    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("mandi_tokens.id"), nullable=False, unique=True)
    weight_qtl = Column(Float, nullable=False)
    moisture = Column(Float, nullable=False)
    foreign_matter = Column(Float, nullable=False, default=0)
    grade = Column(String, nullable=False)
    rate_per_qtl = Column(Float, nullable=False)
    total_payout = Column(Float, nullable=False)
    inspector_notes = Column(Text, default="")
    tx_hash = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class InventoryFacility(Base):
    __tablename__ = "inventory_facilities"

    id = Column(String, primary_key=True)
    crop = Column(String, nullable=False)
    silo = Column(String, nullable=False)
    current_stock = Column(Float, nullable=False)
    capacity = Column(Float, nullable=False)
    grade = Column(String, nullable=False)
    msp_rate = Column(Float, nullable=False)
    last_inspected = Column(String, nullable=False)


class DispatchRecord(Base):
    __tablename__ = "dispatch_records"

    id = Column(Integer, primary_key=True, index=True)
    gate_pass = Column(String, unique=True, nullable=False)
    facility_id = Column(String, ForeignKey("inventory_facilities.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    destination = Column(String, nullable=False)
    truck_number = Column(String, nullable=False)
    driver_name = Column(String, nullable=False)
    driver_phone = Column(String, nullable=False)
    dispatched_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String, nullable=False, default="In Transit")
