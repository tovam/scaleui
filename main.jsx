const { useState, useEffect, useRef } = React;
const { createRoot } = ReactDOM;

// Configurable constants
const DEFAULT_DELTA_T = 500; // 0.5 seconds (in ms)
const MAX_PLOT_DURATION = 300000; // 5 minutes in ms
const MEAN_WINDOW = 10000; // 10 seconds for advanced mean calculation

// ---------------------
// Custom Hook: usePolling
// ---------------------
// Runs a polling callback every 'delay' ms and ensures no overlapping API calls.
function usePolling(apiCall, delay = DEFAULT_DELTA_T) {
  const [data, setData] = useState(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const inProgress = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!inProgress.current) {
        inProgress.current = true;
        apiCall()
          .then((result) => {
            setData(result);
            setTimestamp(Date.now());
            inProgress.current = false;
          })
          .catch((err) => {
            console.error(err);
            inProgress.current = false;
          });
      }
    }, delay);
    return () => clearInterval(timer);
  }, [apiCall, delay]);

  return { data, timestamp };
}

// ---------------------
// Navigation Component
// ---------------------
const Navigation = ({ activeTab, setActiveTab }) => {
  const navStyle = {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    marginBottom: '20px',
  };
  const buttonStyle = (tab) => ({
    padding: '10px 20px',
    cursor: 'pointer',
    backgroundColor: activeTab === tab ? '#007bff' : '#ccc',
    color: activeTab === tab ? '#fff' : '#333',
    border: 'none',
    borderRadius: '5px',
  });
  return (
    <nav style={navStyle}>
      <button style={buttonStyle("home")} onClick={() => setActiveTab("home")}>
        Home
      </button>
      <button style={buttonStyle("battery")} onClick={() => setActiveTab("battery")}>
        Battery Monitor
      </button>
      <button style={buttonStyle("basicCalib")} onClick={() => setActiveTab("basicCalib")}>
        Basic Calibration
      </button>
      <button style={buttonStyle("advCalib")} onClick={() => setActiveTab("advCalib")}>
        Advanced Calibration
      </button>
    </nav>
  );
};

// ---------------------
// Home Page: Weight & Battery Status
// ---------------------
const HomePage = () => {
  const [scaleData, setScaleData] = useState({});
  const [statusIcon, setStatusIcon] = useState('green');

  // Poll the /api/status endpoint every 5 seconds (using native setInterval here)
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => {
          setScaleData(data);
          setStatusIcon(data.battery < 3.1 ? 'red' : 'green');
        })
        .catch((err) => console.error('Error fetching status:', err));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0,0,0,0.2)',
    maxWidth: '500px',
    margin: 'auto',
  };

  return (
    <div style={containerStyle}>
      <h1>ESP NOW Weight Scale</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
        <span style={{ fontSize: '24px' }}>
          {statusIcon === 'green' ? '🟢' : '🔴'}
        </span>
        <p>Status: {statusIcon === 'green' ? 'Normal' : 'Low Battery'}</p>
      </div>
      {scaleData.weight !== undefined && (
        <div style={{ width: '100%', textAlign: 'left' }}>
          <h2>Measurement Data</h2>
          <p><strong>Weight:</strong> {scaleData.weight} kg</p>
          <p><strong>Battery Level:</strong> {scaleData.battery} V</p>
          <p><strong>VDD33 (ROM PHY):</strong> {scaleData.rom_phy_get_vdd33}</p>
        </div>
      )}
      <div style={{ marginTop: '15px' }}>
        <button
          onClick={() => {
            fetch('/espnow_weight_real')
              .then((res) => res.json())
              .then((data) => setScaleData(data))
              .catch((err) => console.error('Error fetching weight:', err));
          }}
          style={{
            padding: '8px 15px',
            fontSize: '14px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
};

// ---------------------
// Battery Monitor Page with Live Plotting
// ---------------------
const BatteryPage = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [currentRom, setCurrentRom] = useState(null);
  // We'll keep our own data array with { time, value }
  const [plotData, setPlotData] = useState([]);

  // Use our polling hook on the /api/status endpoint
  const { data } = usePolling(() => fetch('/api/status').then((res) => res.json()), DEFAULT_DELTA_T);

  // When new data comes in, update plotData (only keep data within MAX_PLOT_DURATION)
  useEffect(() => {
    if (data && typeof data.rom_phy_get_vdd33 !== "undefined") {
      const now = Date.now();
      setCurrentRom(data.rom_phy_get_vdd33);
      setPlotData((prev) => {
        const newData = [...prev, { time: now, value: data.rom_phy_get_vdd33 }];
        return newData.filter((d) => now - d.time <= MAX_PLOT_DURATION);
      });
    }
  }, [data]);

  // Set up Chart.js
  useEffect(() => {
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: plotData.map(d => new Date(d.time).toLocaleTimeString()),
        datasets: [{
          label: 'rom_phy_get_vdd33',
          data: plotData.map(d => d.value),
          borderColor: 'blue',
          fill: false,
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false }
        }
      }
    });
    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, []); // initialize once

  // Update chart when plotData changes
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.data.labels = plotData.map(d => new Date(d.time).toLocaleTimeString());
      chartInstance.current.data.datasets[0].data = plotData.map(d => d.value);
      chartInstance.current.update();
    }
  }, [plotData]);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0,0,0,0.2)',
    maxWidth: '600px',
    margin: 'auto',
  };
  const canvasStyle = { width: '100%', height: '300px' };

  return (
    <div style={containerStyle}>
      <h1>Battery Monitor</h1>
      <p>Current ROM VDD33: {currentRom !== null ? currentRom : 'Loading...'}</p>
      <div style={{ width: '100%', marginTop: '20px' }}>
        <canvas ref={chartRef} style={canvasStyle} />
      </div>
    </div>
  );
};

// ---------------------
// Basic Calibration Page
// ---------------------
const BasicCalibrationPage = () => {
  const [calData, setCalData] = useState({ raw_value: null, current_scale: '', current_offset: '' });
  const [newScale, setNewScale] = useState('');
  const [newOffset, setNewOffset] = useState('');
  const [rawSim, setRawSim] = useState('');
  const [simulatedWeight, setSimulatedWeight] = useState(null);
  const [message, setMessage] = useState('');
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [plotData, setPlotData] = useState([]);

  // Poll the calibration endpoint using our custom hook
  const { data } = usePolling(() => fetch('/api/scale/raw').then((res) => res.json()), DEFAULT_DELTA_T);

  // Update calibration data and plot (keeping data for MAX_PLOT_DURATION)
  useEffect(() => {
    if (data) {
      setCalData(data);
      if (newScale === '') setNewScale(data.current_scale);
      if (newOffset === '') setNewOffset(data.current_offset);
      const now = Date.now();
      setPlotData((prev) => {
        const newData = [...prev, { time: now, value: data.raw_value }];
        return newData.filter((d) => now - d.time <= MAX_PLOT_DURATION);
      });
    }
  }, [data]);

  // Set up Chart.js for live raw value plot
  useEffect(() => {
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: plotData.map(d => new Date(d.time).toLocaleTimeString()),
        datasets: [{
          label: 'Raw Value',
          data: plotData.map(d => d.value),
          borderColor: 'green',
          fill: false,
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { display: false } }
      }
    });
    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, []); // once

  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.data.labels = plotData.map(d => new Date(d.time).toLocaleTimeString());
      chartInstance.current.data.datasets[0].data = plotData.map(d => d.value);
      chartInstance.current.update();
    }
  }, [plotData]);

  // Simulator: weight (in grams) = (raw input - offset) / scale
  const simulateWeight = (raw, scale, offset) => {
    if (!raw || !scale || !offset) return null;
    const r = parseFloat(raw), s = parseFloat(scale), o = parseFloat(offset);
    if (isNaN(r) || isNaN(s) || isNaN(o) || s === 0) return null;
    return ((r - o) / s).toFixed(3);
  };

  useEffect(() => {
    const sim = simulateWeight(rawSim, newScale, newOffset);
    setSimulatedWeight(sim);
  }, [rawSim, newScale, newOffset]);

  const fetchCalibration = () => {
    fetch('/api/scale/raw')
      .then((res) => res.json())
      .then((data) => {
        setCalData(data);
        setNewScale(data.current_scale);
        setNewOffset(data.current_offset);
      })
      .catch((err) => console.error('Error fetching calibration:', err));
  };

  const handleTare = () => {
    fetch('/api/scale/tare')
      .then((res) => res.text())
      .then((txt) => {
        setMessage(txt);
        fetchCalibration();
      })
      .catch((err) => console.error('Error taring scale:', err));
  };

  const handleSetCalibration = () => {
    if (parseFloat(newScale) === 0) {
      setMessage("Invalid scale value");
      return;
    }
    fetch(`/api/scale/set_calibration?scale=${newScale}&offset=${newOffset}`)
      .then((res) => res.text())
      .then((txt) => {
        setMessage(txt);
        fetchCalibration();
      })
      .catch((err) => console.error('Error setting calibration:', err));
  };

  const handleSaveCalibration = () => {
    fetch('/save')
      .then((res) => res.text())
      .then((txt) => setMessage(txt))
      .catch((err) => console.error('Error saving calibration:', err));
  };

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0,0,0,0.2)',
    maxWidth: '800px',
    margin: 'auto',
  };

  const sectionStyle = {
    width: '100%',
    marginBottom: '20px',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
  };

  const inputStyle = {
    padding: '5px',
    fontSize: '14px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    marginBottom: '5px',
    width: '100%',
  };

  // Danger (red) style for calibration actions
  const dangerButtonStyle = {
    padding: '8px 15px',
    fontSize: '14px',
    backgroundColor: 'red',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    margin: '5px 0',
    width: '100%',
  };

  return (
    <div style={containerStyle}>
      <h1>Basic Calibration</h1>
      
      <div style={sectionStyle}>
        <h2>Current Calibration Values</h2>
        <p><strong>Raw Value:</strong> {calData.raw_value !== null ? calData.raw_value : 'Loading...'}</p>
        <p><strong>Scale:</strong> {calData.current_scale}</p>
        <p><strong>Offset:</strong> {calData.current_offset}</p>
        <button style={dangerButtonStyle} onClick={fetchCalibration}>Refresh Calibration Data</button>
      </div>

      <div style={sectionStyle}>
        <h2>Edit Calibration</h2>
        <label>Scale:</label>
        <input
          style={inputStyle}
          type="number"
          value={newScale}
          onChange={(e) => setNewScale(e.target.value)}
        />
        <label>Offset:</label>
        <input
          style={inputStyle}
          type="number"
          value={newOffset}
          onChange={(e) => setNewOffset(e.target.value)}
        />
        <button style={dangerButtonStyle} onClick={handleSetCalibration}>Set Calibration</button>
        <button style={dangerButtonStyle} onClick={handleTare}>Tare Scale</button>
        {/* Warning only shown near save */}
        <p style={{ color: 'red', fontSize: '12px' }}>
          Warning: Saving will overwrite calibration data stored in the ESP's EEPROM.
        </p>
        <button style={dangerButtonStyle} onClick={handleSaveCalibration}>Save Calibration</button>
      </div>

      <div style={sectionStyle}>
        <h2>Calibration Simulator</h2>
        <p>Simulated Weight (g) = (Raw Input - Offset) / Scale</p>
        <label>Raw Input Value:</label>
        <input
          style={inputStyle}
          type="number"
          value={rawSim}
          onChange={(e) => setRawSim(e.target.value)}
        />
        <p>
          Simulated Weight: {simulatedWeight !== null ? simulatedWeight + ' g' : 'Enter raw value'}
        </p>
      </div>

      <div style={sectionStyle}>
        <h2>Live Raw Value Plot</h2>
        <div style={{ width: '100%', marginTop: '10px' }}>
          <canvas ref={chartRef} style={{ width: '100%', height: '300px' }} />
        </div>
      </div>

      {message && (
        <div style={{ backgroundColor: '#e0e0e0', padding: '10px', borderRadius: '5px', width: '100%' }}>
          {message}
        </div>
      )}
    </div>
  );
};

// ---------------------
// Advanced Calibration Page
// ---------------------
const AdvancedCalibrationPage = () => {
  const [rawData, setRawData] = useState(null);        // Latest raw value from API
  const [rawBuffer, setRawBuffer] = useState([]);        // Buffer for last 10s readings
  const [meanRaw, setMeanRaw] = useState(null);          // Mean of rawBuffer
  const [zeroWeight, setZeroWeight] = useState('');      // User-provided zero weight value
  const [calPoints, setCalPoints] = useState([]);        // Array of { raw, actual }
  const [pointRaw, setPointRaw] = useState('');
  const [pointActual, setPointActual] = useState('');
  const [fitResults, setFitResults] = useState(null);    // Proposed calibration (scale, offset)
  const [logPlotData, setLogPlotData] = useState([]);      // Data for log plot (calibration points)
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // Poll raw calibration data from /api/scale/raw using our hook
  const { data } = usePolling(() => fetch('/api/scale/raw').then(res => res.json()), DEFAULT_DELTA_T);

  // Update rawData and rawBuffer
  useEffect(() => {
    if (data && typeof data.raw_value !== "undefined") {
      const now = Date.now();
      setRawData(data.raw_value);
      setRawBuffer((prev) => {
        const newBuffer = [...prev, { time: now, value: data.raw_value }];
        // Keep only points from the last 10 seconds
        return newBuffer.filter(pt => now - pt.time <= MEAN_WINDOW);
      });
    }
  }, [data]);

  // Compute mean raw value from buffer
  useEffect(() => {
    if (rawBuffer.length > 0) {
      const sum = rawBuffer.reduce((acc, pt) => acc + pt.value, 0);
      setMeanRaw((sum / rawBuffer.length).toFixed(3));
    }
  }, [rawBuffer]);

  // Handle adding a new calibration point
  const addCalPoint = () => {
    if (pointRaw === '' || pointActual === '') return;
    const newPoint = { raw: parseFloat(pointRaw), actual: parseFloat(pointActual) };
    setCalPoints((prev) => [...prev, newPoint]);
    // Also update log plot data (exclude point if its actual equals zeroWeight)
    if (parseFloat(pointActual) !== parseFloat(zeroWeight)) {
      setLogPlotData((prev) => [...prev, newPoint]);
    }
    setPointRaw('');
    setPointActual('');
  };

  // Remove a calibration point by index
  const removeCalPoint = (index) => {
    setCalPoints((prev) => prev.filter((_, i) => i !== index));
    setLogPlotData((prev) => prev.filter((_, i) => i !== index));
  };

  // Compute best fitting linear regression from calPoints (if at least 2 points)
  useEffect(() => {
    if (calPoints.length >= 2) {
      let n = calPoints.length;
      let sumX = calPoints.reduce((sum, p) => sum + p.raw, 0);
      let sumY = calPoints.reduce((sum, p) => sum + p.actual, 0);
      let sumXY = calPoints.reduce((sum, p) => sum + p.raw * p.actual, 0);
      let sumX2 = calPoints.reduce((sum, p) => sum + p.raw * p.raw, 0);
      const denominator = n * sumX2 - sumX * sumX;
      if (denominator !== 0) {
        let slope = (n * sumXY - sumX * sumY) / denominator;
        let intercept = (sumY - slope * sumX) / n;
        // Given the model actual = (raw - offset)/scale,
        // we compare with actual = a * raw + b, so proposed:
        let proposedScale = (slope !== 0) ? (1 / slope).toFixed(3) : 'N/A';
        let proposedOffset = (slope !== 0) ? (-intercept / slope).toFixed(3) : 'N/A';
        setFitResults({ scale: proposedScale, offset: proposedOffset });
      }
    } else {
      setFitResults(null);
    }
  }, [calPoints]);

  // Set up Chart.js for calibration log plot (scatter plot)
  useEffect(() => {
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Calibration Points',
          data: logPlotData.map(pt => ({ x: pt.raw, y: pt.actual })),
          backgroundColor: 'purple'
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Raw Value' } },
          y: { title: { display: true, text: 'Actual Weight' } }
        }
      }
    });
    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, []); // once

  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.data.datasets[0].data = logPlotData.map(pt => ({ x: pt.raw, y: pt.actual }));
      chartInstance.current.update();
    }
  }, [logPlotData]);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0,0,0,0.2)',
    maxWidth: '900px',
    margin: 'auto',
  };

  const sectionStyle = {
    width: '100%',
    marginBottom: '20px',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
  };

  const inputStyle = {
    padding: '5px',
    fontSize: '14px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    marginBottom: '5px',
    width: '100%',
  };

  const dangerButtonStyle = {
    padding: '8px 15px',
    fontSize: '14px',
    backgroundColor: 'red',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    margin: '5px 0',
    width: '100%',
  };

  const canvasStyle = { width: '100%', height: '300px' };

  return (
    <div style={containerStyle}>
      <h1>Advanced Calibration</h1>
      
      <div style={sectionStyle}>
        <h2>Real-Time Raw Value</h2>
        <p>Current Raw Value: {rawData !== null ? rawData : 'Loading...'}</p>
        <p>Mean Raw Value (last 10s): {meanRaw !== null ? meanRaw : 'Calculating...'}</p>
      </div>

      <div style={sectionStyle}>
        <h2>Calibration Points</h2>
        <label>Zero Weight (to be excluded in log plot):</label>
        <input
          style={inputStyle}
          type="number"
          value={zeroWeight}
          onChange={(e) => setZeroWeight(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <div style={{ flex: 1 }}>
            <label>Raw Value:</label>
            <input
              style={inputStyle}
              type="number"
              value={pointRaw}
              onChange={(e) => setPointRaw(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Actual Weight:</label>
            <input
              style={inputStyle}
              type="number"
              value={pointActual}
              onChange={(e) => setPointActual(e.target.value)}
            />
          </div>
        </div>
        <button style={dangerButtonStyle} onClick={addCalPoint}>Add Calibration Point</button>
        {calPoints.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <h3>Calibration Points List</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {calPoints.map((pt, idx) => (
                <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Raw: {pt.raw} | Actual: {pt.actual}</span>
                  <button style={{ ...dangerButtonStyle, padding: '3px 8px', fontSize: '12px', width: 'auto' }} onClick={() => removeCalPoint(idx)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <h2>Calibration Log Plot & Best Fit</h2>
        <div style={{ width: '100%', marginBottom: '10px' }}>
          <canvas ref={chartRef} style={canvasStyle} />
        </div>
        {fitResults ? (
          <p>Proposed Calibration: Scale = {fitResults.scale}, Offset = {fitResults.offset}</p>
        ) : (
          <p>Need at least 2 calibration points (excluding zero weight) to compute best fit.</p>
        )}
      </div>
    </div>
  );
};

// ---------------------
// Main App with Tab-based Navigation
// ---------------------
const App = () => {
  const [activeTab, setActiveTab] = useState("home");
  const appContainer = {
    fontFamily: 'Arial, sans-serif',
    padding: '20px',
    backgroundColor: '#fff',
    minHeight: '100vh',
  };
  return (
    <div style={appContainer}>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab === "home" && <HomePage />}
      {activeTab === "battery" && <BatteryPage />}
      {activeTab === "basicCalib" && <BasicCalibrationPage />}
      {activeTab === "advCalib" && <AdvancedCalibrationPage />}
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
