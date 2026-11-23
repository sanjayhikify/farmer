/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import API from "../../api";

const MandiContext = createContext();

export function MandiProvider({ children }) {
  const [tokens, setTokens] = useState([]);
  const [stats, setStats] = useState({
    scannedToday: 0,
    approved: 0,
    rejected: 0,
  });
  const [summary, setSummary] = useState({
    intakeQtl: 0,
    averageGradeA: 0,
    averageMoisture: null,
    totalPayout: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [tokenResponse, statsResponse, summaryResponse] = await Promise.all([
        API.get("/operations/tokens"),
        API.get("/operations/scanner-stats"),
        API.get("/operations/summary"),
      ]);
      setTokens(tokenResponse.data);
      setStats(statsResponse.data);
      setSummary(summaryResponse.data);
      setLastSyncedAt(new Date());
      setError("");
    } catch (requestError) {
      console.error("Could not load mandi operations:", requestError);
      setError("Could not load live Mandi data. Check the API/database connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(refresh);
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const updateTokenStatus = async (tokenId, newStatus, extraData = {}) => {
    const response = await API.put(
      `/operations/tokens/${encodeURIComponent(tokenId)}/status`,
      { status: newStatus }
    );
    setTokens((previous) =>
      previous.map((token) =>
        token.id === tokenId
          ? { ...token, ...response.data, ...extraData }
          : token
      )
    );
    const statsResponse = await API.get("/operations/scanner-stats");
    setStats(statsResponse.data);
    return response.data;
  };

  const addToken = async (token) => {
    const response = await API.post("/operations/tokens", {
      farmer: token.farmer,
      phone: token.phone,
      village: token.village,
      crop: token.crop,
      quantity: token.rawQuintals,
      slot: token.slot,
      status: token.status,
    });
    setTokens((previous) => [response.data, ...previous]);
    return response.data;
  };

  return (
    <MandiContext.Provider
      value={{
        tokens,
        stats,
        summary,
        loading,
        error,
        lastSyncedAt,
        refresh,
        updateTokenStatus,
        addToken,
      }}
    >
      {children}
    </MandiContext.Provider>
  );
}

export function useMandi() {
  const context = useContext(MandiContext);
  if (!context) {
    throw new Error("useMandi must be used within a MandiProvider");
  }
  return context;
}
