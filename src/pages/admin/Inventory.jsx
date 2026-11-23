import { useCallback, useEffect, useState } from "react";
import AdminLayout from "./AdminLayout";
import API from "../../api";

const DESTINATIONS = [
  "FCI Central Grain Depot (Sanganer)",
  "Rajasthan State Food Civil Supplies Reserve",
  "NAFED Agro Commodity Terminal (Jaipur)",
  "Central Warehousing Corp (CWC) Hub",
  "State Roller Flour Mills Ltd",
];

function Inventory() {
  const [facilities, setFacilities] = useState([]);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  // Dispatch Form State
  const [dispatchForm, setDispatchForm] = useState({
    facilityId: "",
    quantity: 250,
    destination: DESTINATIONS[0],
    truckNumber: "RJ-14-GA-8921",
    driverName: "Surendra Meena",
    driverPhone: "+91 94140 12098",
  });

  const [dispatchLedger, setDispatchLedger] = useState([]);

  const loadInventory = useCallback(async () => {
    try {
      const [facilityResponse, dispatchResponse] = await Promise.all([
        API.get("/operations/inventory"),
        API.get("/operations/dispatches"),
      ]);
      setFacilities(facilityResponse.data);
      setDispatchLedger(dispatchResponse.data);
      setErrorMessage("");
      setDispatchForm((previous) => ({
        ...previous,
        facilityId: previous.facilityId || facilityResponse.data[0]?.id || "",
      }));
    } catch (error) {
      console.error("Could not load inventory:", error);
      setErrorMessage("Could not load inventory from the database.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadInventory);
  }, [loadInventory]);

  // Total summary calculations
  const totalStored = facilities.reduce((sum, f) => sum + f.current, 0);
  const totalCapacity = facilities.reduce((sum, f) => sum + f.capacity, 0);
  const totalFree = totalCapacity - totalStored;
  const overallUtilizationPct = totalCapacity
    ? ((totalStored / totalCapacity) * 100).toFixed(1)
    : "0.0";

  const selectedFacility = facilities.find((f) => f.id === dispatchForm.facilityId);

  const handleOpenDispatch = (facilityId) => {
    if (!facilities.length) return;
    setDispatchForm({
      ...dispatchForm,
      facilityId: facilityId || facilities[0]?.id || "",
      quantity: 100,
    });
    setIsDispatchModalOpen(true);
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();

    const qty = Number(dispatchForm.quantity);
    if (!selectedFacility) {
      setErrorMessage("No storage facility is available for dispatch.");
      return;
    }
    if (qty <= 0) {
      alert("Please enter a valid dispatch quantity greater than 0.");
      return;
    }
    if (qty > selectedFacility.current) {
      alert(`Cannot dispatch ${qty} Qtl. Maximum available stock in ${selectedFacility.silo} is ${selectedFacility.current} Qtl.`);
      return;
    }

    setIsSaving(true);
    try {
      await API.post("/operations/dispatches", {
        facility_id: selectedFacility.id,
        quantity: qty,
        destination: dispatchForm.destination,
        truck_number: dispatchForm.truckNumber,
        driver_name: dispatchForm.driverName,
        driver_phone: dispatchForm.driverPhone,
      });
      await loadInventory();
      setIsDispatchModalOpen(false);
      setToastMessage(`Dispatched ${qty} Qtl ${selectedFacility.crop} to ${dispatchForm.destination}`);
      setTimeout(() => setToastMessage(""), 4500);
    } catch (error) {
      console.error("Could not save dispatch:", error);
      setErrorMessage(error.response?.data?.detail || "Could not save dispatch.");
    } finally {
      setIsSaving(false);
    }
  };

  const getMeterColorClass = (pct) => {
    if (pct >= 80) return "fill-warning";
    if (pct >= 60) return "fill-moderate";
    return "fill-optimal";
  };

  return (
    <AdminLayout>
      <header className="admin-topbar">
        <div className="page-intro">
          <h1 className="text-dark-slate">Procurement Inventory & Silos</h1>
          <p className="text-subtle-slate">
            PostgreSQL-backed warehouse balances and dispatch ledger. Initial stock values are samples; reconcile them with verified stock before authorizing a dispatch.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="btn-primary"
            onClick={() => handleOpenDispatch()}
            disabled={isLoading || facilities.length === 0}
            title="Dispatch grain batch to FCI or State Reserve"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
            Dispatch Batch
          </button>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      )}
      {isLoading && <p className="mb-4 text-sm text-slate-600">Loading database inventory...</p>}

      {/* Top Storage Capacity KPI Cards */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Grain In Stock</span>
            <div className="kpi-icon-pill" style={{ background: "#ecfdf5", color: "#059669" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">{totalStored.toLocaleString()} Qtl</p>
          <div className="kpi-trend positive">
            <span>Across 4 storage facilities</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Mandi Capacity</span>
            <div className="kpi-icon-pill" style={{ background: "#eff6ff", color: "#2563eb" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M3 9h18"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">{totalCapacity.toLocaleString()} Qtl</p>
          <div className="kpi-trend">
            <span>{totalFree.toLocaleString()} Qtl free buffer space</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Storage Utilization</span>
            <div className="kpi-icon-pill" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">{overallUtilizationPct}%</p>
          <div className="kpi-trend positive">
            <span>Healthy operational headroom</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Stock Asset Value</span>
            <div className="kpi-icon-pill" style={{ background: "#fffbeb", color: "#d97706" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
                <path d="M12 18V6"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">
            ₹{" "}
            {(
              facilities.reduce((acc, cur) => acc + cur.current * cur.mspRate, 0) / 10000000
            ).toFixed(2)}{" "}
            Cr
          </p>
          <div className="kpi-trend positive">
            <span>Configured MSP Valuation</span>
          </div>
        </div>
      </section>

      {/* Live Storage Capacity Meters */}
      <section>
        <h2 className="text-dark-slate" style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 14px 0" }}>
          Silo & Warehouse Capacity Meters
        </h2>

        <div className="capacity-meters-grid">
          {facilities.map((fac) => {
            const fillPct = Math.round((fac.current / fac.capacity) * 100);
            return (
              <div key={fac.id} className="capacity-meter-card">
                <div className="meter-header">
                  <div>
                    <h3 className="meter-silo-title">{fac.silo}</h3>
                    <p className="meter-crop-type">{fac.crop}</p>
                  </div>
                  <span className="meter-percentage">{fillPct}%</span>
                </div>

                <div className="meter-track">
                  <div
                    className={`meter-fill ${getMeterColorClass(fillPct)}`}
                    style={{ width: `${fillPct}%` }}
                  ></div>
                </div>

                <div className="meter-stats">
                  <span>{fac.current.toLocaleString()} Qtl filled</span>
                  <span>{fac.capacity.toLocaleString()} Qtl capacity</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Stock Breakdown Table */}
      <div className="table-panel">
        <div className="table-panel-header">
          <div>
            <h2 className="panel-title text-dark-slate">Mandi Commodity Stock Ledger</h2>
            <p className="panel-subtitle text-subtle-slate">
              Active inventory breakdown by commodity variety, storage silo, and quality grade
            </p>
          </div>
        </div>

        <div className="queue-table-container">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Commodity & Variety</th>
                <th>Storage Bay</th>
                <th>Current Stock</th>
                <th>Capacity</th>
                <th>Fill Meter</th>
                <th>Quality Grade</th>
                <th>Asset Value</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((fac) => {
                const fillPct = Math.round((fac.current / fac.capacity) * 100);
                const assetVal = fac.current * fac.mspRate;
                return (
                  <tr key={fac.id}>
                    <td className="farmer-cell text-dark-slate">{fac.crop}</td>
                    <td className="token-cell text-dark-slate">{fac.silo}</td>
                    <td style={{ fontWeight: 700, color: "#0f172a" }}>{fac.current.toLocaleString()} Qtl</td>
                    <td className="slot-cell text-dark-slate">{fac.capacity.toLocaleString()} Qtl</td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="meter-track" style={{ height: 6 }}>
                          <div
                            className={`meter-fill ${getMeterColorClass(fillPct)}`}
                            style={{ width: `${fillPct}%` }}
                          ></div>
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                          {fillPct}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="status-pill status-gate-verified">
                        <span className="status-dot"></span>
                        {fac.grade}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
                      ₹ {(assetVal / 100000).toFixed(2)} L
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                        onClick={() => handleOpenDispatch(fac.id)}
                      >
                        Dispatch
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outbound Dispatch History Ledger */}
      <div className="table-panel" style={{ marginTop: "24px" }}>
        <div className="table-panel-header">
          <div>
            <h2 className="panel-title text-dark-slate">Outbound Dispatch Ledger</h2>
            <p className="panel-subtitle text-subtle-slate">
              {dispatchLedger.length} shipments authorized and routed to state granaries & FCI depots
            </p>
          </div>
        </div>

        <div className="queue-table-container">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Gate Pass #</th>
                <th>Produce & Source</th>
                <th>Quantity</th>
                <th>Destination</th>
                <th>Truck / Carrier</th>
                <th>Dispatch Time</th>
                <th>Transit Status</th>
              </tr>
            </thead>
            <tbody>
              {dispatchLedger.map((rec) => (
                <tr key={rec.gatePass}>
                  <td className="token-cell text-dark-slate">{rec.gatePass}</td>
                  <td className="farmer-cell text-dark-slate">
                    {rec.crop}
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{rec.from}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: "#0f172a" }}>{rec.quantity} Qtl</td>
                  <td className="slot-cell text-dark-slate" style={{ fontSize: "13px" }}>
                    {rec.destination}
                  </td>
                  <td className="slot-cell text-dark-slate">{rec.truck}</td>
                  <td className="slot-cell text-dark-slate">{rec.timestamp}</td>
                  <td>
                    <span
                      className={`status-pill ${
                        rec.status === "Delivered" ? "status-paid" : "status-in-inspection"
                      }`}
                    >
                      <span className="status-dot"></span>
                      {rec.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Dispatch Batch */}
      {isDispatchModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDispatchModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleDispatchSubmit}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title text-dark-slate">Authorize Outbound Dispatch</h3>
                  <span style={{ fontSize: "12px", color: "#475569" }}>
                    Generate transit gate pass & deduct storage batch
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setIsDispatchModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-grid">
                  {/* Select Storage Silo */}
                  <div className="form-group full-width">
                    <label className="form-label text-dark-slate">Source Silo / Commodity *</label>
                    <select
                      className="form-select input-high-contrast"
                      value={dispatchForm.facilityId}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, facilityId: e.target.value })}
                    >
                      {facilities.map((fac) => (
                        <option key={fac.id} value={fac.id}>
                          {fac.silo} — {fac.crop} (Available: {fac.current.toLocaleString()} Qtl)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity to Dispatch */}
                  <div className="form-group">
                    <label className="form-label text-dark-slate">
                      Dispatch Quantity (Quintals) *{" "}
                      <span style={{ color: "#059669" }}>(Max: {selectedFacility?.current || 0} Qtl)</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={selectedFacility?.current || 0}
                      className="form-input input-high-contrast"
                      value={dispatchForm.quantity}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, quantity: e.target.value })}
                      required
                    />
                  </div>

                  {/* Destination Depot */}
                  <div className="form-group">
                    <label className="form-label text-dark-slate">Destination Facility *</label>
                    <select
                      className="form-select input-high-contrast"
                      value={dispatchForm.destination}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, destination: e.target.value })}
                    >
                      {DESTINATIONS.map((dest) => (
                        <option key={dest} value={dest}>
                          {dest}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Transport Truck Number */}
                  <div className="form-group">
                    <label className="form-label text-dark-slate">Authorized Carrier Truck # *</label>
                    <input
                      type="text"
                      className="form-input input-high-contrast"
                      placeholder="e.g. RJ-14-GA-8921"
                      value={dispatchForm.truckNumber}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, truckNumber: e.target.value })}
                      required
                    />
                  </div>

                  {/* Driver Name & Phone */}
                  <div className="form-group">
                    <label className="form-label text-dark-slate">Driver Name & Contact</label>
                    <input
                      type="text"
                      className="form-input input-high-contrast"
                      placeholder="e.g. Surendra Meena (+91 94140...)"
                      value={dispatchForm.driverName}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-dark-slate">Driver Phone *</label>
                    <input
                      type="tel"
                      className="form-input input-high-contrast"
                      value={dispatchForm.driverPhone}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, driverPhone: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsDispatchModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving dispatch..." : "Sign Gate Pass & Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="success-toast">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style={{ fontWeight: 600 }}>{toastMessage}</span>
        </div>
      )}
    </AdminLayout>
  );
}

export default Inventory;
