const { useState, useEffect, useRef, memo, useMemo, useCallback } = React;
const { createRoot } = ReactDOM;

const App = ({ accounts }) => {
  const [count, setCount] = useState(0);
  const [sleepTime, setSleepTime] = useState(5 * 60); // initial sleep time to 5 minutes
  const [scaleData, setScaleData] = useState({}); // Renamed to scaleData
  const [statusIcon, setStatusIcon] = useState('green'); // Initialize status icon as green

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/')
        .then((response) => response.json())
        .then((data) => {
          if (data['vcc'] < 3.1) {
            setStatusIcon('red');
          } else {
            setStatusIcon('green');
          }
        })
        .catch((error) => console.error('Error:', error));
    }, 5000); // Update status icon every 5 seconds

    return () => clearInterval(interval); // Clean up interval on component unmount
  }, []);

  useEffect(() => {
    getScaleData(); // Updated function call
  }, []);

  const updateSleepTime = () => {
    fetch(`/set_sleep_time?sleep_time=${sleepTime}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((response) => response.json())
      .then((data) => console.log('Sleep time updated:', data))
      .catch((error) => console.error('Error:', error));
  };

  const getScaleData = () => { 
    fetch('/espnow_weight_real')
      .then((response) => response.json())
      .then((data) => setScaleData(data)) // Directly set the data object to scaleData
      .catch((error) => console.error('Error:', error));
  };

  const showTouchRead = () => {
    fetch('/show_touchread', { method: 'GET' })
      .then(() => console.log('Touch read shown'))
      .catch((error) => console.error('Error:', error));
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>ESP NOW Weight Scale</h1>
      <div style={styles.status}>
        <span style={{ ...styles.statusIcon, color: statusIcon === 'green' ? 'green' : 'red' }}>
          {statusIcon === 'green' ? '🟢' : '🔴'}
        </span>
        <p>Status: {statusIcon === 'green' ? 'Normal' : 'Low Battery'}</p>
      </div>
      <div style={styles.controls}>
        <label style={styles.label}>Sleep Time (s): </label>
        <input
          type="number"
          value={sleepTime}
          onChange={(e) => setSleepTime(e.target.value)}
          style={styles.input}
        />
        <button onClick={updateSleepTime} style={styles.button}>
          Set Sleep Time
        </button>
        <button onClick={getScaleData} style={styles.button}>
          Get Weight and Battery
        </button>
        <button onClick={showTouchRead} style={styles.button}>
          Show Touch Read
        </button>
      </div>
      {scaleData.weight && (
        <div style={styles.dataDisplay}>
          <h2 style={styles.dataHeader}>Measurement Data</h2>
          <div style={styles.dataItem}>
            <strong>Weight:</strong> <span>{scaleData.weight} kg</span>
          </div>
          <div style={styles.dataItem}>
            <strong>Battery Level:</strong> <span>{scaleData.battery}</span>
          </div>
          <div style={styles.dataItem}>
            <strong>VDD33 (ROM PHY):</strong> <span>{scaleData.rom_phy_get_vdd33}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Inline styles for JSX elements
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    fontFamily: 'Arial, sans-serif',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)',
    maxWidth: '500px',
    margin: 'auto',
    marginTop: '30px',
  },
  header: {
    fontSize: '24px',
    marginBottom: '10px',
    color: '#333',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '15px',
  },
  statusIcon: {
    fontSize: '24px',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  label: {
    marginBottom: '5px',
  },
  input: {
    padding: '5px',
    fontSize: '14px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    marginBottom: '5px',
  },
  button: {
    padding: '8px 15px',
    fontSize: '14px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    margin: '5px 0',
  },
  buttonHover: {
    backgroundColor: '#0056b3',
  },
  dataDisplay: {
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '10px',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
    width: '100%',
    textAlign: 'left',
  },
  dataHeader: {
    fontSize: '18px',
    borderBottom: '1px solid #ddd',
    paddingBottom: '5px',
    marginBottom: '10px',
  },
  dataItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    fontSize: '16px',
  },
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
