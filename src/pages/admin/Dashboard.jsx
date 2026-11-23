import { useState, useEffect } from "react";
import AdminLayout from "./AdminLayout";
import { useMandi } from "./MandiContext";

const HOURS_LIST = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const CROP_OPTIONS = [
  "Wheat (HD-2967)",
  "Wheat (WH-1105)",
  "Wheat (Sharbati)",
  "Paddy (PR-114)",
  "Paddy (PB-1509)",
  "Cotton (Bt)",
  "Mustard (Pusa-31)",
  "Bajra (HHB-67)",
  "Soybean (JS-335)",
];

function Dashboard() {
  // Shared state from MandiContext (synced with ScanToken and across tabs)
  const { tokens, addToken, refresh, summary, error: operationsError, lastSyncedAt } = useMandi();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All Tokens");
  const [now, setNow] = useState(0);
  const [selectedToken, setSelectedToken] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);

  // Form State for Token Issuance
  const [formData, setFormData] = useState({
    farmer: "",
    phone: "",
    village: "Jaipur Rural",
    crop: "Wheat (HD-2967)",
    quantity: "50",
    slot: "11:15 AM",
    status: "Waiting",
  });

  // Live timer simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const secondsAgo = lastSyncedAt
    ? Math.max(0, Math.floor((now - lastSyncedAt.getTime()) / 1000))
    : null;

  const filterOptions = [
    "All Tokens",
    "Waiting",
    "Gate Verified",
    "In Inspection",
    "Quality Complete",
    "Paid",
  ];

  // Real-time table filter based on status and search query
  const filteredTokens = tokens.filter((item) => {
    const matchesFilter =
      selectedFilter === "All Tokens" || item.status === selectedFilter;

    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesFilter;

    const matchesSearch =
      item.id.toLowerCase().includes(query) ||
      item.farmer.toLowerCase().includes(query) ||
      item.crop.toLowerCase().includes(query) ||
      item.village.toLowerCase().includes(query) ||
      item.phone.includes(query);

    return matchesFilter && matchesSearch;
  });

  // Count helper
  const getCountByStatus = (status) => {
    if (status === "All Tokens") return tokens.length;
    return tokens.filter((t) => t.status === status).length;
  };

  // Status CSS helper
  const getStatusClass = (status) => {
    switch (status) {
      case "Waiting":
        return "status-waiting";
      case "Gate Verified":
        return "status-gate-verified";
      case "In Inspection":
        return "status-in-inspection";
      case "Paid":
      case "Quality Complete":
        return "status-paid";
      default:
        return "";
    }
  };

  // =========================================================================
  // Dynamic Calculation of Throughput Graph based on Selected Filter
  // =========================================================================
  const rawThroughputData = HOURS_LIST.map((hour) => {
    const matchingInHour = tokens.filter((token) => {
      const time = token.slot?.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)/i);
      if (!time) return false;
      let hourNumber = Number(time[1]) % 12;
      if (time[2].toUpperCase() === "PM") hourNumber += 12;
      const label = `${hourNumber % 12 || 12} ${hourNumber >= 12 ? "PM" : "AM"}`;
      return label === hour && (selectedFilter === "All Tokens" || token.status === selectedFilter);
    });
    const quintals = matchingInHour.reduce(
      (acc, t) => acc + (t.rawQuintals || parseInt(t.quantity, 10) || 50),
      0
    );

    return {
      time: hour,
      value: quintals,
      max: Math.max(120, quintals),
    };
  });

  // Find dynamic peak hour for current filter
  const peakVal = Math.max(...rawThroughputData.map((d) => d.value));
  const peakItem = rawThroughputData.find((d) => d.value === peakVal && d.value > 0);

  const throughputData = rawThroughputData.map((d) => ({
    ...d,
    isPeak: peakItem ? d.time === peakItem.time : false,
  }));

  // Dynamic Total Quintals processed
  const totalFilteredQuintals = rawThroughputData.reduce((acc, d) => acc + d.value, 0);

  // Handle Token Form Submission
  const handleCreateToken = async (e) => {
    e.preventDefault();
    if (!formData.farmer.trim()) {
      alert("Please enter farmer name.");
      return;
    }

    setIsSavingToken(true);
    try {
      const newToken = await addToken({
        farmer: formData.farmer.trim(),
        phone: formData.phone.trim(),
        village: formData.village.trim(),
        crop: formData.crop,
        rawQuintals: Number(formData.quantity),
        slot: formData.slot,
        status: formData.status,
      });
      setFormData({
        farmer: "",
        phone: "",
        village: "Jaipur Rural",
        crop: "Wheat (HD-2967)",
        quantity: "50",
        slot: "11:15 AM",
        status: "Waiting",
      });
      setIsCreateModalOpen(false);
      setToastMessage(`Token ${newToken.id} created for ${newToken.farmer}!`);
      setTimeout(() => setToastMessage(""), 4000);
    } catch (error) {
      console.error("Could not create procurement token:", error);
      setToastMessage(error.response?.data?.detail || "Could not save token to the database.");
    } finally {
      setIsSavingToken(false);
    }
  };

  return (
    <AdminLayout>
      {/* Top Banner & Action Controls */}
      <header className="admin-topbar">
        <div className="page-intro">
          <h1>Command Center</h1>
          <p>Real-time Mandi procurement telemetry, throughput metrics, and incoming token flow.</p>
        </div>
        <div className="topbar-actions">
          <span className="mandi-badge">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
            Mandi: Jaipur Central RJ-04
          </span>
          <button
            className="btn-primary"
            onClick={() => setIsCreateModalOpen(true)}
            title="Issue a new farmer procurement appointment token"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Issue Token
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              refresh();
            }}
            title="Refresh Live Telemetry"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Sync Data
          </button>
        </div>
      </header>

      {operationsError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700">
          {operationsError}
        </div>
      )}

      {/* KPI Cards Row (Connected dynamically with MandiContext) */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Booked Volume</span>
            <div className="kpi-icon-pill" style={{ background: "#ecfdf5", color: "#059669" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                <path d="M3 6h18"></path>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">{summary.intakeQtl.toLocaleString()} Qtl</p>
          <div className="kpi-trend positive">
            <span>Quintals in saved Mandi tokens</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Pipeline</span>
            <div className="kpi-icon-pill" style={{ background: "#eff6ff", color: "#2563eb" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">{tokens.length} Tokens</p>
          <div className="kpi-trend">
            <span>
              {getCountByStatus("Waiting")} waiting · {getCountByStatus("Gate Verified")} gate · {getCountByStatus("In Inspection")} in test
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Avg Quality Grade</span>
            <div className="kpi-icon-pill" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6"></circle>
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path>
              </svg>
            </div>
          </div>
          <p className="kpi-value">Grade A ({summary.averageGradeA}%)</p>
          <div className="kpi-trend positive">
            <span>
              Avg moisture: {summary.averageMoisture === null ? "—" : `${summary.averageMoisture}%`}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Estimated MSP Payout</span>
            <div className="kpi-icon-pill" style={{ background: "#fffbeb", color: "#d97706" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                <line x1="2" x2="22" y1="10" y2="10"></line>
              </svg>
            </div>
          </div>
          <p className="kpi-value">₹ {summary.totalPayout.toLocaleString()}</p>
          <div className="kpi-trend positive">
            <span>{summary.qualityRecords} saved records; settlement not integrated</span>
          </div>
        </div>
      </section>

      {/* Main Operations Grid: Chart & Table */}
      <section className="operations-dashboard-grid">
        {/* Left Column: Dynamically Recalculated Throughput Chart */}
        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Booked Volume by Arrival Window</h2>
              <p className="panel-subtitle">
                {selectedFilter === "All Tokens"
                  ? "Scheduled quintals by slot hour"
                  : `${selectedFilter} load: ${totalFilteredQuintals} Quintals`}
              </p>
            </div>
            <div className="chart-legend-badge">
              <span className="legend-dot"></span>
              {selectedFilter === "All Tokens" ? "Quintals" : selectedFilter}
            </div>
          </div>

          <div className="chart-canvas-container">
            {/* Y-Axis Labels */}
            <div className="chart-y-axis">
              <span>{selectedFilter === "All Tokens" ? "200" : "120"}</span>
              <span>{selectedFilter === "All Tokens" ? "150" : "90"}</span>
              <span>{selectedFilter === "All Tokens" ? "100" : "60"}</span>
              <span>{selectedFilter === "All Tokens" ? "50" : "30"}</span>
              <span>0</span>
            </div>

            {/* Plot Area with Vertical Bars */}
            <div className="chart-plot-area">
              <div className="chart-gridlines">
                <div className="gridline"></div>
                <div className="gridline"></div>
                <div className="gridline"></div>
                <div className="gridline"></div>
                <div className="gridline"></div>
              </div>

              <div className="chart-bars-row">
                {throughputData.map((item, index) => {
                  const barHeightPct = item.max > 0 ? (item.value / item.max) * 100 : 0;
                  return (
                    <div
                      key={index}
                      className={`bar-column ${item.isPeak ? "peak-hour" : ""}`}
                    >
                      <div className="bar-tooltip">
                        {item.time}: {item.value} Qtl {item.isPeak ? "⚡ Peak" : ""} ({selectedFilter})
                      </div>
                      <div
                        className="bar-fill"
                        style={{
                          height: `${Math.min(100, Math.max(item.value > 0 ? 4 : 0, barHeightPct))}%`,
                          transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      ></div>
                    </div>
                  );
                })}
              </div>

              {/* X-Axis Time Labels */}
              <div className="chart-x-labels">
                {throughputData.map((item, index) => (
                  <span key={index} className="x-label">
                    {index % 2 === 0 ? item.time : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-footer-stat">
            <span>Peak Hour ({selectedFilter})</span>
            <span className="highlight-metric">
              {peakItem
                ? `${peakItem.time} · ${peakItem.value} Quintals`
                : "No active queue load"}
            </span>
          </div>
        </div>

        {/* Right Column: Live Operations Queue Table */}
        <div className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2 className="panel-title">Live Operations Queue</h2>
              <p className="panel-subtitle">
                {filteredTokens.length} {filteredTokens.length === 1 ? "token" : "tokens"} · {secondsAgo === null ? "Loading" : `Updated ${secondsAgo}s ago`}
              </p>
            </div>

            {/* Search Input with Clear Button */}
            <div className="search-input-wrapper">
              <span className="search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                type="text"
                className="search-input"
                placeholder="Search token, farmer or crop"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="clear-search-btn"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Interactive Filter Pills Bar */}
          <div className="filter-tabs-row">
            <span className="filter-icon-btn" title="Filter Queue by Status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </span>
            {filterOptions.map((filter) => {
              const count = getCountByStatus(filter);
              return (
                <button
                  key={filter}
                  className={`filter-pill ${selectedFilter === filter ? "active" : ""}`}
                  onClick={() => setSelectedFilter(filter)}
                >
                  {filter}
                  <span className="filter-badge-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Live Operations Queue Table */}
          <div className="queue-table-container">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Token #</th>
                  <th>Farmer</th>
                  <th>Crop</th>
                  <th>Slot</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.length > 0 ? (
                  filteredTokens.map((item) => (
                    <tr
                      key={item.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedToken(item)}
                    >
                      <td className="token-cell">{item.id}</td>
                      <td className="farmer-cell">
                        <div>{item.farmer}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                          {item.village}
                        </div>
                      </td>
                      <td className="crop-cell">
                        <div>{item.crop}</div>
                        <div className="crop-variety">{item.quantity}</div>
                      </td>
                      <td className="slot-cell">{item.slot}</td>
                      <td>
                        <span className={`status-pill ${getStatusClass(item.status)}`}>
                          <span className="status-dot"></span>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn-action-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedToken(item);
                          }}
                          title="View Token Telemetry"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                      <div style={{ marginBottom: "8px", fontWeight: 600, color: "var(--text-primary)" }}>
                        No procurement tokens found
                      </div>
                      <p style={{ fontSize: "13px", margin: "0 0 16px" }}>
                        No entries match "{searchQuery}" under "{selectedFilter}".
                      </p>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedFilter("All Tokens");
                        }}
                      >
                        Reset Filters
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Modal: Issue/Create New Token */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateToken}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Issue Procurement Token</h3>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Save an appointment and issue an operations token
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label className="form-label">Farmer Full Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Suresh Kumar"
                      required
                      value={formData.farmer}
                      onChange={(e) => setFormData({ ...formData, farmer: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Phone</label>
                    <input
                      type="tel"
                      className="form-input"
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tehsil / Village</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Bassi, Jaipur"
                      value={formData.village}
                      onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Produce Crop & Variety</label>
                    <select
                      className="form-select"
                      value={formData.crop}
                      onChange={(e) => setFormData({ ...formData, crop: e.target.value })}
                    >
                      {CROP_OPTIONS.map((cropName) => (
                        <option key={cropName} value={cropName}>
                          {cropName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Batch Quantity (Quintals)</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      placeholder="50"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Preferred Mandi Slot</label>
                    <select
                      className="form-select"
                      value={formData.slot}
                      onChange={(e) => setFormData({ ...formData, slot: e.target.value })}
                    >
                      <option value="11:15 AM">11:15 AM</option>
                      <option value="11:30 AM">11:30 AM</option>
                      <option value="11:45 AM">11:45 AM</option>
                      <option value="12:00 PM">12:00 PM</option>
                      <option value="02:00 PM">02:00 PM</option>
                      <option value="02:30 PM">02:30 PM</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Initial Status</label>
                    <select
                      className="form-select"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="Waiting">Waiting (Gate Entry Pending)</option>
                      <option value="Gate Verified">Gate Verified (Arrived)</option>
                      <option value="In Inspection">In Inspection (Lab Bay)</option>
                      <option value="Paid">Paid (Procured)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSavingToken}>
                  {isSavingToken ? "Saving token..." : "Generate Token & Enqueue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Token Details */}
      {selectedToken && (
        <div className="modal-overlay" onClick={() => setSelectedToken(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Procurement Token Details</h3>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedToken.id}
                </span>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedToken(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">Farmer Name:</span>
                <span className="detail-value">{selectedToken.farmer}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Phone & Village:</span>
                <span className="detail-value">{selectedToken.phone} ({selectedToken.village})</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Produce & Variety:</span>
                <span className="detail-value">{selectedToken.crop}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Batch Quantity:</span>
                <span className="detail-value">{selectedToken.quantity}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Designated Slot:</span>
                <span className="detail-value" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedToken.slot}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Moisture Reading:</span>
                <span className="detail-value">{selectedToken.moisture}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Quality Assessment:</span>
                <span className="detail-value">{selectedToken.grade}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">MSP Base Price:</span>
                <span className="detail-value" style={{ color: "#059669" }}>{selectedToken.price}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Current Pipeline Status:</span>
                <span className={`status-pill ${getStatusClass(selectedToken.status)}`}>
                  <span className="status-dot"></span>
                  {selectedToken.status}
                </span>
              </div>
              <div className="detail-row" style={{ borderBottom: "none" }}>
                <span className="detail-label">Database token reference:</span>
                <span className="detail-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#64748b" }}>
                  {selectedToken.id}
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setSelectedToken(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Success Toast */}
      {toastMessage && (
        <div className="success-toast">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </AdminLayout>
  );
}

export default Dashboard;
