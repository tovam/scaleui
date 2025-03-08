const { useState, useEffect } = React;
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

  // Update battery status every 5 seconds using /api/status endpoint
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => {
          // Using battery voltage (in V) to determine status
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

  const statusStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '15px',
  };

  return (
    <div style={containerStyle}>
      <h1>ESP NOW Weight Scale</h1>
      <div style={statusStyle}>
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

// Battery Monitor Page Component
const BatteryPage = () => {
  const [batteryVoltage, setBatteryVoltage] = useState(null);
  const [history, setHistory] = useState([]);

  // Fetch battery voltage from /vcc endpoint every second
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/vcc')
        .then((res) => res.text())
        .then((txt) => {
          const voltage = parseInt(txt, 10) / 1000; // convert mV to V
          setBatteryVoltage(voltage);
          setHistory((prev) => {
            const newHistory = [...prev, voltage];
            return newHistory.slice(-20); // keep last 20 readings
          });
        })
        .catch((err) => console.error('Error fetching VCC:', err));
    }, 1000);
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
      <h1>Battery Monitor</h1>
      <p style={{ fontSize: '20px' }}>
        Current Voltage: {batteryVoltage !== null ? batteryVoltage.toFixed(3) + ' V' : 'Loading...'}
      </p>
      <h3>Recent Readings</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {history.map((v, index) => (
          <li key={index} style={{ margin: '3px 0' }}>
            {v.toFixed(3)} V
          </li>
        ))}
      </ul>
    </div>
  );
};

// Calibration Page Component
const CalibratePage = () => {
  const [calData, setCalData] = useState({
    raw_value: null,
    current_scale: '',
    current_offset: '',
  });
  const [newScale, setNewScale] = useState('');
  const [newOffset, setNewOffset] = useState('');
  const [rawSim, setRawSim] = useState('');
  const [simulatedWeight, setSimulatedWeight] = useState(null);
  const [message, setMessage] = useState('');

  // Function to refresh calibration data from /api/scale/raw
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

  useEffect(() => {
    fetchCalibration();
  }, []);

  // Simulation: weight (kg) = (rawSim - offset) / scale
  const simulateWeight = (raw, scale, offset) => {
    if (!raw || !scale || !offset) return null;
    // Convert to number and compute simulated weight.
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

  // Handlers for tare, set calibration, and save
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
    // Validate newScale is non-zero.
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
    backgroundColor: '#f5f5f5',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0,0,0,0.2)',
    maxWidth: '600px',
    margin: 'auto',
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

  return (
    <div style={containerStyle}>
      <h1>Calibration</h1>
      <div style={{ width: '100%', marginBottom: '15px' }}>
        <h3>Current Calibration Values</h3>
        <p><strong>Raw Value:</strong> {calData.raw_value !== null ? calData.raw_value : 'Loading...'}</p>
        <p><strong>Scale:</strong> {calData.current_scale}</p>
        <p><strong>Offset:</strong> {calData.current_offset}</p>
        <button style={buttonStyle} onClick={fetchCalibration}>Refresh Calibration Data</button>
      </div>

      <div style={{ width: '100%', marginBottom: '15px' }}>
        <h3>Edit Calibration Values</h3>
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

      <div style={{ width: '100%', marginBottom: '15px' }}>
        <h3>Calibration Simulator</h3>
        <p>
          Simulated weight (kg) = (Raw Input - Offset) / Scale
        </p>
        <label>Raw Input Value:</label>
        <input
          style={inputStyle}
          type="number"
          value={rawSim}
          onChange={(e) => setRawSim(e.target.value)}
        />
        <p>
          Simulated Weight: {simulatedWeight !== null ? simulatedWeight + ' kg' : 'Enter raw value'}
        </p>
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
