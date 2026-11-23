# AgriFlow Farmer Procurement

AgriFlow is a React/Vite frontend with a FastAPI and PostgreSQL backend. Farmer registration, login, slot booking, queue information, Mandi token activity, quality records, inventory, and dispatch records use the backend database.

## Run locally on Windows

1. Create a PostgreSQL database (the default example name is `farmerconnect`).
2. Copy `backend\.env.example` to `backend\.env` and set `DATABASE_URL` to your PostgreSQL connection string. Keep `.env` files private.
3. In a terminal:

   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

   On startup, the API creates its application tables. The database user must have permission to create tables.
4. In a second terminal at the repository root:

   ```powershell
   npm install
   npm run dev
   ```

   The frontend uses `http://localhost:8000` by default. Set `VITE_API_URL` in a root `.env` file to use a different API URL.

The API health check is `http://localhost:8000/health`. PostgreSQL must be running before starting the API.

Inventory facility quantities are initialized in the database on first access using the sample values previously shown in the demo UI; subsequent dispatches update the stored quantities and ledger.

## Tests

```powershell
cd backend
.\venv\Scripts\python.exe -m unittest discover -s tests
```

```powershell
npm run build
npm run lint
```
