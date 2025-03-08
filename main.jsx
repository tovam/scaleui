const { useState, useEffect, useRef } = React;
const { createRoot } = ReactDOM;

// Simple Navigation Component
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
      <button style={buttonStyle("calibrate")} onClick={() => setActiveTab("calibrate")}>
        Calibration
      </button>
    </nav>
  );
};

// Home Page Component: Weight & Battery Status
const HomePage = () => {
  const [scaleData, setScaleData] = useState({});
  const [statusIcon, setStatusIcon] = useState('green');

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => {
          if (data.battery < 3.1) {
            setStatusIcon('red');
          } else {
            setStatusIcon('green');
          }
          setScaleData(data);
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

// Battery Monitor Page Component with live chart of rom_phy_get_vdd33 values
const BatteryPage = () => {
  const [currentRom, setCurrentRom] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    // Create chart instance
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'rom_phy_get_vdd33',
          data: [],
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

    // Poll /api/status every second to update ROM value
    const interval = setInterval(() => {
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => {
          const newValue = data.rom_phy_get_vdd33;
          setCurrentRom(newValue);
          if (chartInstance.current) {
            const chart = chartInstance.current;
            const now = new Date().toLocaleTimeString();
            chart.data.labels.push(now);
            chart.data.datasets[0].data.push(newValue);
            // Keep only last 20 data points
            if (chart.data.labels.length > 20) {
              chart.data.labels.shift();
              chart.data.datasets[0].data.shift();
            }
            chart.update();
          }
        })
        .catch((err) => console.error(err));
    }, 1000);

    return () => {
      clearInterval(interval);
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, []);

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

// Calibration Page Component with live raw value updates and plotting
const CalibratePage = () => {
  const [calData, setCalData] = useState({ raw_value: null, current_scale: '', current_offset: '' });
  const [newScale, setNewScale] = useState('');
  const [newOffset, setNewOffset] = useState('');
  const [rawSim, setRawSim] = useState('');
  const [simulatedWeight, setSimulatedWeight] = useState(null);
  const [message, setMessage] = useState('');
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // Poll calibration endpoint every second and update chart with raw_value
  const fetchCalibration = () => {
    fetch('/api/scale/raw')
      .then((res) => res.json())
      .then((data) => {
        setCalData(data);
        if (newScale === '') setNewScale(data.current_scale);
        if (newOffset === '') setNewOffset(data.current_offset);
        if (chartInstance.current) {
          const now = new Date().toLocaleTimeString();
          chartInstance.current.data.labels.push(now);
          chartInstance.current.data.datasets[0].data.push(data.raw_value);
          if (chartInstance.current.data.labels.length > 20) {
            chartInstance.current.data.labels.shift();
            chartInstance.current.data.datasets[0].data.shift();
          }
          chartInstance.current.update();
        }
      })
      .catch((err) => console.error('Error fetching calibration:', err));
  };

  useEffect(() => {
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Raw Value',
          data: [],
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
    const interval = setInterval(fetchCalibration, 1000);
    return () => {
      clearInterval(interval);
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, []);

  // Simulation: weight (in grams) = (raw input - offset) / scale
  const simulateWeight = (raw, scale, offset) => {
    if (!raw || !scale || !offset) return null;
    const r = parseFloat(raw);
    const s = parseFloat(scale);
    const o = parseFloat(offset);
    if (isNaN(r) || isNaN(s) || isNaN(o) || s === 0) return null;
    return ((r - o) / s).toFixed(3);
  };

  useEffect(() => {
    const sim = simulateWeight(rawSim, newScale, newOffset);
    setSimulatedWeight(sim);
  }, [rawSim, newScale, newOffset]);

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

  const buttonStyle = {
    padding: '8px 15px',
    fontSize: '14px',
    backgroundColor: '#007bff',
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
      <h1>Calibration</h1>
      
      <div style={sectionStyle}>
        <h2>Current Calibration Values</h2>
        <p><strong>Raw Value:</strong> {calData.raw_value !== null ? calData.raw_value : 'Loading...'}</p>
        <p><strong>Scale:</strong> {calData.current_scale}</p>
        <p><strong>Offset:</strong> {calData.current_offset}</p>
        <p style={{ color: 'red', fontSize: '12px' }}>
          Warning: Changing calibration values and saving will overwrite the calibration data stored in the ESP's EEPROM.
        </p>
        <button style={buttonStyle} onClick={fetchCalibration}>Refresh Calibration Data</button>
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
        <button style={buttonStyle} onClick={handleSetCalibration}>Set Calibration</button>
        <button style={buttonStyle} onClick={handleTare}>Tare Scale</button>
        <button style={buttonStyle} onClick={handleSaveCalibration}>Save Calibration</button>
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
          <canvas ref={chartRef} style={canvasStyle} />
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

// Main App with Tab-based Navigation
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
      {activeTab === "calibrate" && <CalibratePage />}
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
