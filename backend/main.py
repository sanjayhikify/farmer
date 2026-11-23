from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from sqlalchemy import inspect, text

from database.connection import Base, engine
from models import booking, farmer, operations, slot
from routers.farmers import router as farmers_router
from routers.operations import router as operations_router


app = FastAPI(title="FarmerConnect API")


# Allow the React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# PostgreSQL farmers API
app.include_router(farmers_router)
app.include_router(operations_router)


@app.on_event("startup")
def initialize_database():
    Base.metadata.create_all(bind=engine)
    farmer_columns = {
        column["name"] for column in inspect(engine).get_columns("farmers")
    }
    scan_columns = {
        column["name"] for column in inspect(engine).get_columns("mandi_scans")
    }
    with engine.begin() as connection:
        for column in ("village", "district", "land_size"):
            if column not in farmer_columns:
                connection.execute(text(f"ALTER TABLE farmers ADD COLUMN {column} VARCHAR"))
        if "gate_pass" not in scan_columns:
            connection.execute(text("ALTER TABLE mandi_scans ADD COLUMN gate_pass VARCHAR"))
            connection.execute(
                text("CREATE UNIQUE INDEX ix_mandi_scans_gate_pass ON mandi_scans (gate_pass)")
            )


class Procurement(BaseModel):
    farmerId: str
    procurementId: str
    crop: str
    quantity: int
    pricePerKg: int
    centreId: str


@app.get("/")
def home():
    return {
        "message": "Farmer Procurement Backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


@app.post("/procurement")
def create_procurement(data: Procurement):

    blockchain_response = requests.post(
        "http://127.0.0.1:3001/record-procurement",
        json=data.model_dump()
    )

    blockchain_data = blockchain_response.json()

    return {
        "message": "Procurement recorded successfully",
        "procurement": data,
        "blockchain": blockchain_data
    }


@app.get("/procurement/{procurementId}")
def get_procurement(procurementId: str):

    blockchain_response = requests.get(
        f"http://127.0.0.1:3001/procurement/{procurementId}"
    )

    blockchain_data = blockchain_response.json()

    procurement = blockchain_data.get("procurement", {})

    if not procurement.get("procurementId"):
        raise HTTPException(
            status_code=404,
            detail=f"Procurement ID '{procurementId}' not found"
        )

    return {
        "message": "Procurement retrieved successfully",
        "blockchain": blockchain_data
    }