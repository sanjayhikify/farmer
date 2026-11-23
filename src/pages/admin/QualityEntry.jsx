import { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout";
import API from "../../api";
import { useMandi } from "./MandiContext";

const GRADE_MULTIPLIERS = {
  "Grade A (FAQ Standard)": { multiplier: 1.0, badgeColor: "#059669", bg: "#ecfdf5" },
  "Grade B (Fair Quality)": { multiplier: 0.95, badgeColor: "#d97706", bg: "#fffbeb" },
  "Grade C (Under-grade)": { multiplier: 0.88, badgeColor: "#dc2626", bg: "#fef2f2" },
};

function QualityEntry() {
  const { tokens, refresh } = useMandi();
  const activeTokens = tokens.filter((token) => token.status === "Gate Verified" || token.status === "In Inspection");
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [weight, setWeight] = useState("");
  const [moisture, setMoisture] = useState(10.8);
  const [grade, setGrade] = useState("Grade A (FAQ Standard)");
  const [foreignMatter, setForeignMatter] = useState(0.75);
  const [inspectorNotes, setInspectorNotes] = useState("Uniform grain size, no weevil infestation, clean golden luster.");
  const [toastMessage, setToastMessage] = useState("");
  const [qualityHistory, setQualityHistory] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    API.get("/operations/quality")
      .then((response) => setQualityHistory(response.data))
      .catch((error) => {
        console.error("Could not load quality history:", error);
        setToastMessage("Could not load saved quality records.");
      });
  }, []);

  // Current token info
  const currentToken = activeTokens.find((t) => t.id === selectedTokenId) || activeTokens[0];
  const effectiveWeight = Number(weight) || currentToken?.rawQuintals || 1;

  // Calculate Moisture Penalty
  // Optimal <= 12%, 12.1% - 14% -> 2% dockage, >14% -> 5% dockage
  const moistureDockage = moisture <= 12.0 ? 0 : moisture <= 14.0 ? 0.02 : 0.05;

  // Grade adjustment
  const gradeMultiplier = GRADE_MULTIPLIERS[grade]?.multiplier || 1.0;

  // Net Rate calculation
  const effectiveMultiplier = gradeMultiplier - moistureDockage;
  const netRatePerQtl = Math.round((currentToken?.basePrice || 0) * effectiveMultiplier);
  const totalPayout = Math.round(effectiveWeight * netRatePerQtl);

  const handleTokenChange = (e) => {
    const nextId = e.target.value;
    setSelectedTokenId(nextId);
    const found = activeTokens.find((t) => t.id === nextId);
    if (found) {
      setWeight(found.rawQuintals || 1);
      setMoisture(Number.parseFloat(found.moisture) || 10.8);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentToken) return;
    setIsSaving(true);
    try {
      const response = await API.post("/operations/quality", {
        token_id: currentToken.id,
        weight: effectiveWeight,
        moisture: Number(moisture),
        foreign_matter: Number(foreignMatter),
        grade,
        inspector_notes: inspectorNotes,
      });
      setQualityHistory((previous) => [response.data, ...previous]);
      setToastMessage(`Quality saved: ${currentToken.id}, payout ₹ ${totalPayout.toLocaleString()}`);
      setSelectedTokenId("");
      await refresh();
      setTimeout(() => setToastMessage(""), 4000);
    } catch (error) {
      console.error("Could not save quality record:", error);
      setToastMessage(error.response?.data?.detail || "Could not save quality record.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout>
      <header className="admin-topbar">
        <div className="page-intro">
          <h1 className="text-dark-slate">Quality Inspection & Assay</h1>
          <p className="text-subtle-slate">
            Enter inspection measurements, assign a quality grade, and save a payout estimate.
          </p>
        </div>
        <div className="topbar-actions">
          <span className="mandi-badge text-dark-slate">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
            Manual Quality Entry
          </span>
        </div>
      </header>

      {activeTokens.length === 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          No gate-verified batches are awaiting quality inspection.
        </div>
      )}

      {/* Main Inspection Form Panel */}
      <div className="table-panel" style={{ padding: "32px", textAlign: "left" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <h2 className="text-dark-slate" style={{ fontSize: "19px", fontWeight: 700, margin: 0 }}>
                Produce Assay Record Entry
              </h2>
              <p className="text-subtle-slate" style={{ fontSize: "13.5px", margin: "4px 0 0" }}>
                Select a gate-approved token and enter its measured quality details.
              </p>
            </div>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                background: "#f1f5f9",
                color: "#0f172a",
                padding: "6px 14px",
                borderRadius: "9999px",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Base MSP: ₹ {currentToken?.basePrice || 0} / Qtl
            </span>
          </div>

          <div className="form-grid" style={{ marginBottom: "20px" }}>
            {/* Token Selector */}
            <div className="form-group full-width">
              <label className="form-label text-dark-slate">Select Verified Farmer Token *</label>
              <select
                className="form-select input-high-contrast"
                style={{ fontSize: "14px", fontWeight: 600 }}
                value={currentToken?.id || ""}
                onChange={handleTokenChange}
              >
                {activeTokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} — {t.farmer} ({t.crop}) — Batch: {t.weight} Qtl
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Weight */}
            <div className="form-group">
              <label className="form-label text-dark-slate">Received Batch Weight (Quintals) *</label>
              <input
                type="number"
                step="0.5"
                min="1"
                className="form-input input-high-contrast"
                value={weight || currentToken?.rawQuintals || ""}
                onChange={(e) => setWeight(Number(e.target.value))}
                required
              />
            </div>

            {/* Moisture % */}
            <div className="form-group">
              <label className="form-label text-dark-slate">
                Moisture Measurement (%) *{" "}
                <span style={{ color: moisture <= 12 ? "#059669" : "#d97706", fontWeight: 600 }}>
                  ({moisture <= 12 ? "Optimal Standard" : moisture <= 14 ? "2% Dockage" : "5% High Moisture Dockage"})
                </span>
              </label>
              <input
                type="number"
                step="0.1"
                min="5"
                max="25"
                className="form-input input-high-contrast"
                value={moisture}
                onChange={(e) => setMoisture(Number(e.target.value))}
                required
              />
            </div>

            {/* Quality Grade */}
            <div className="form-group">
              <label className="form-label text-dark-slate">Quality Grade *</label>
              <select
                className="form-select input-high-contrast"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                <option value="Grade A (FAQ Standard)">Grade A (FAQ Standard - 100% MSP)</option>
                <option value="Grade B (Fair Quality)">Grade B (Fair Quality - 95% MSP)</option>
                <option value="Grade C (Under-grade)">Grade C (Under-grade - 88% MSP)</option>
              </select>
            </div>

            {/* Foreign Matter Admixture % */}
            <div className="form-group">
              <label className="form-label text-dark-slate">Foreign Matter / Inert Material (%)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="10"
                className="form-input input-high-contrast"
                value={foreignMatter}
                onChange={(e) => setForeignMatter(Number(e.target.value))}
              />
            </div>

            {/* Inspector Notes */}
            <div className="form-group full-width">
              <label className="form-label text-dark-slate">Inspector Remarks & Visual Assessment</label>
              <input
                type="text"
                className="form-input input-high-contrast"
                value={inspectorNotes}
                onChange={(e) => setInspectorNotes(e.target.value)}
                placeholder="Physical grain texture, luster, absence of pest damage"
              />
            </div>
          </div>

          {/* Live Calculated MSP Payout Box */}
          <div className="payout-calculation-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                Estimated MSP Payout Calculation
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: GRADE_MULTIPLIERS[grade].badgeColor,
                  background: GRADE_MULTIPLIERS[grade].bg,
                  padding: "4px 10px",
                  borderRadius: "9999px",
                }}
              >
                {grade}
              </span>
            </div>

            <div className="payout-row">
              <span>Selected Produce:</span>
              <span className="text-dark-slate" style={{ fontWeight: 600 }}>
                {currentToken?.crop || "No batch selected"} ({currentToken?.farmer || "—"})
              </span>
            </div>

            <div className="payout-row">
              <span>Configured Base MSP Rate:</span>
              <span className="text-dark-slate" style={{ fontWeight: 600 }}>
                ₹ {(currentToken?.basePrice || 0).toLocaleString()} / Quintal
              </span>
            </div>

            <div className="payout-row">
              <span>Grade Adjustment & Moisture Dockage:</span>
              <span style={{ color: effectiveMultiplier < 1 ? "#dc2626" : "#059669", fontWeight: 600 }}>
                {Math.round(effectiveMultiplier * 100)}% of Base Rate (
                {moistureDockage > 0 ? `-${Math.round(moistureDockage * 100)}% moisture` : "No moisture penalty"}
                )
              </span>
            </div>

            <div className="payout-row">
              <span>Estimated Net Rate:</span>
              <span className="text-dark-slate" style={{ fontWeight: 700 }}>
                ₹ {netRatePerQtl.toLocaleString()} / Quintal
              </span>
            </div>

            <div className="payout-row total-row">
              <span>Estimated Farmer Payout ({weight} Quintals):</span>
              <span className="payout-grand-total">₹ {totalPayout.toLocaleString()}</span>
            </div>
          </div>

          {/* Submit Action */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={!currentToken || isSaving}
              style={{ padding: "12px 28px", fontSize: "14px" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              {isSaving ? "Saving quality record..." : "Submit Quality Record"}
            </button>
          </div>
        </form>
      </div>

      {/* Quality Inspection History Ledger */}
      <div className="table-panel" style={{ marginTop: "24px" }}>
        <div className="table-panel-header">
          <div>
            <h2 className="panel-title text-dark-slate">Quality Inspection Ledger</h2>
            <p className="panel-subtitle text-subtle-slate">
              {qualityHistory.length} quality records saved; payment settlement is not integrated
            </p>
          </div>
        </div>

        <div className="queue-table-container">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Token #</th>
                <th>Farmer</th>
                <th>Crop & Batch</th>
                <th>Moisture</th>
                <th>Assigned Grade</th>
                <th>Net Rate</th>
                <th>Total Payout</th>
                <th>Recorded At & Reference</th>
              </tr>
            </thead>
            <tbody>
              {qualityHistory.map((rec, idx) => (
                <tr key={idx}>
                  <td className="token-cell text-dark-slate">{rec.id}</td>
                  <td className="farmer-cell text-dark-slate">{rec.farmer}</td>
                  <td className="crop-cell text-dark-slate">{rec.crop} ({rec.weight} Qtl)</td>
                  <td className="slot-cell text-dark-slate">{rec.moisture}%</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "9999px",
                        background: GRADE_MULTIPLIERS[rec.grade]?.bg || "#ecfdf5",
                        color: GRADE_MULTIPLIERS[rec.grade]?.badgeColor || "#059669",
                      }}
                    >
                      {rec.grade.split(" ")[0]} {rec.grade.split(" ")[1]}
                    </span>
                  </td>
                  <td className="slot-cell text-dark-slate" style={{ fontWeight: 600 }}>
                    ₹ {rec.rate.toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 800, color: "#059669", fontFamily: "'JetBrains Mono', monospace" }}>
                    ₹ {rec.totalPayout.toLocaleString()}
                  </td>
                  <td className="slot-cell text-dark-slate">
                    <div>{rec.timestamp}</div>
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>{rec.recordId}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

export default QualityEntry;
