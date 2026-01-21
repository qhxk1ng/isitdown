import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Divider
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PublicIcon from '@mui/icons-material/Public';

const PortScanner = () => {
  const [clientIP, setClientIP] = useState('');
  const [port, setPort] = useState('80');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [scanHistory, setScanHistory] = useState([]);

  // Common ports for quick selection
  const commonPorts = [
    { name: 'FTP', port: 21 },
    { name: 'SSH', port: 22 },
    { name: 'Telnet', port: 23 },
    { name: 'SMTP', port: 25 },
    { name: 'DNS', port: 53 },
    { name: 'HTTP', port: 80 },
    { name: 'POP3', port: 110 },
    { name: 'HTTPS', port: 443 },
    { name: 'MySQL', port: 3306 },
    { name: 'RDP', port: 3389 },
  ];

  // Other applications
  const otherApps = [
    { name: 'Minecraft', port: 25565 },
    { name: 'Steam', port: 27015 },
    { name: 'TeamSpeak', port: 9987 },
    { name: 'Discord Voice', port: 64738 },
  ];

  // Get client IP on component mount
  useEffect(() => {
    fetchClientIP();
  }, []);

  const fetchClientIP = async () => {
    try {
      const response = await fetch('/api/client-ip');
      const data = await response.json();
      setClientIP(data.ip);
    } catch (err) {
      console.error('Error fetching client IP:', err);
      setClientIP('Unable to detect IP');
    }
  };

  const checkPort = async () => {
    if (!port || isNaN(port)) {
      setError('Please enter a valid port number');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/port', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: clientIP,
          port: parseInt(port),
          timeout: 5
        }),
      });

      const data = await response.json();
      
      const scanResult = {
        timestamp: new Date().toLocaleTimeString(),
        ip: clientIP,
        port: parseInt(port),
        ...data
      };

      setResult(scanResult);
      
      // Add to history (keep last 5 scans)
      setScanHistory(prev => [scanResult, ...prev.slice(0, 4)]);
    } catch (err) {
      setError('Failed to check port. Please try again.');
      console.error('Error checking port:', err);
    } finally {
      setLoading(false);
    }
  };

  const quickScanPort = async (quickPort) => {
    setPort(quickPort.toString());
    // Small delay to ensure port state updates
    setTimeout(() => checkPort(), 100);
  };

  const scanMultiplePorts = async () => {
    if (!clientIP) {
      setError('Unable to detect your IP address');
      return;
    }

    setScanning(true);
    setError('');
    const results = [];

    // Scan common ports
    for (const portInfo of commonPorts.slice(0, 5)) {
      try {
        const response = await fetch('/api/port', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            host: clientIP,
            port: portInfo.port,
            timeout: 3
          }),
        });
        
        const data = await response.json();
        results.push({
          name: portInfo.name,
          port: portInfo.port,
          ...data,
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        console.error(`Error scanning port ${portInfo.port}:`, err);
      }
    }

    setScanHistory(results);
    setScanning(false);
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600, color: '#1976d2' }}>
        Port Scanner
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        A free utility for remotely verifying if a port is open or closed. Useful for verifying port forwarding, checking if a server is running, or if a firewall/ISP is blocking certain ports.
      </Typography>

      <Card sx={{ mb: 4, boxShadow: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <Typography variant="h6" gutterBottom>
                <PublicIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Your IP
              </Typography>
              <Paper 
                sx={{ 
                  p: 2, 
                  bgcolor: '#f5f5f5',
                  fontFamily: 'monospace',
                  fontSize: '1.1rem',
                  fontWeight: 'bold'
                }}
              >
                {clientIP || 'Detecting...'}
              </Paper>
              <Button 
                size="small" 
                onClick={fetchClientIP}
                sx={{ mt: 1 }}
              >
                Refresh IP
              </Button>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Typography variant="h6" gutterBottom>
                Port to Check
              </Typography>
              <TextField
                fullWidth
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="Enter port number (1-65535)"
                InputProps={{
                  inputProps: { min: 1, max: 65535 }
                }}
                variant="outlined"
              />
            </Grid>
            
            <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={checkPort}
                disabled={loading || !clientIP}
                sx={{ 
                  px: 4, 
                  py: 1.5,
                  fontSize: '1.1rem'
                }}
              >
                {loading ? <CircularProgress size={24} /> : 'Check Port'}
              </Button>
              
              <Button
                variant="outlined"
                color="secondary"
                onClick={scanMultiplePorts}
                disabled={scanning || !clientIP}
                sx={{ mt: 2, ml: 2 }}
              >
                {scanning ? 'Scanning...' : 'Quick Scan'}
              </Button>
            </Grid>
          </Grid>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {result && (
            <Box sx={{ mt: 3, p: 2, bgcolor: '#f8f9fa', borderRadius: 1 }}>
              <Typography variant="h6" gutterBottom>
                Scan Result
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Port</Typography>
                  <Typography variant="h6">{result.port}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {result.open ? (
                      <>
                        <CheckCircleIcon sx={{ color: 'green', mr: 1 }} />
                        <Typography variant="h6" sx={{ color: 'green' }}>OPEN</Typography>
                      </>
                    ) : (
                      <>
                        <CancelIcon sx={{ color: 'red', mr: 1 }} />
                        <Typography variant="h6" sx={{ color: 'red' }}>CLOSED</Typography>
                      </>
                    )}
                  </Box>
                </Grid>
                {result.open && result.latency_ms && (
                  <Grid item xs={6} md={3}>
                    <Typography variant="body2" color="text.secondary">Latency</Typography>
                    <Typography variant="h6">{result.latency_ms.toFixed(2)} ms</Typography>
                  </Grid>
                )}
                {!result.open && result.error && (
                  <Grid item xs={6} md={3}>
                    <Typography variant="body2" color="text.secondary">Error</Typography>
                    <Typography variant="body1">{result.error}</Typography>
                  </Grid>
                )}
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Time</Typography>
                  <Typography variant="body1">{result.timestamp}</Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={4}>
        {/* Common Ports Table */}
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 2 }}>
            <CardContent>
              <Typography variant="h5" gutterBottom sx={{ color: '#1976d2' }}>
                Common Ports
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Click any port to quickly test it
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Service</strong></TableCell>
                      <TableCell><strong>Port</strong></TableCell>
                      <TableCell align="right"><strong>Action</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {commonPorts.map((row) => (
                      <TableRow 
                        key={row.port}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => quickScanPort(row.port)}
                      >
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.port}</TableCell>
                        <TableCell align="right">
                          <Button 
                            size="small" 
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              quickScanPort(row.port);
                            }}
                          >
                            Test
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Other Applications Table */}
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 2 }}>
            <CardContent>
              <Typography variant="h5" gutterBottom sx={{ color: '#1976d2' }}>
                Other Applications
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Popular application ports
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Application</strong></TableCell>
                      <TableCell><strong>Port</strong></TableCell>
                      <TableCell align="right"><strong>Action</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {otherApps.map((row) => (
                      <TableRow 
                        key={row.port}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => quickScanPort(row.port)}
                      >
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.port}</TableCell>
                        <TableCell align="right">
                          <Button 
                            size="small" 
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              quickScanPort(row.port);
                            }}
                          >
                            Test
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <Card sx={{ mt: 4, boxShadow: 2 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom sx={{ color: '#1976d2' }}>
              Recent Scans
            </Typography>
            
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell><strong>Time</strong></TableCell>
                    <TableCell><strong>Port</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Latency</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scanHistory.map((scan, index) => (
                    <TableRow key={index}>
                      <TableCell>{scan.timestamp}</TableCell>
                      <TableCell>
                        <Chip 
                          label={scan.name ? `${scan.name} (${scan.port})` : `Port ${scan.port}`}
                          variant="outlined"
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {scan.open ? (
                          <Chip 
                            icon={<CheckCircleIcon />}
                            label="OPEN"
                            color="success"
                            size="small"
                          />
                        ) : (
                          <Chip 
                            icon={<CancelIcon />}
                            label="CLOSED"
                            color="error"
                            size="small"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {scan.open ? `${scan.latency_ms?.toFixed(2)} ms` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Background Information */}
      <Card sx={{ mt: 4, bgcolor: '#f8f9fa', boxShadow: 1 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
            About Port Scanning
          </Typography>
          <Typography variant="body2" paragraph>
            This tool helps you check if specific ports on your network are open or closed. 
            It's useful for:
          </Typography>
          <ul>
            <li><Typography variant="body2">Verifying port forwarding configuration</Typography></li>
            <li><Typography variant="body2">Checking if a server service is running</Typography></li>
            <li><Typography variant="body2">Testing firewall rules</Typography></li>
            <li><Typography variant="body2">Diagnosing network connectivity issues</Typography></li>
            <li><Typography variant="body2">Ensuring game servers are accessible</Typography></li>
          </ul>
          <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 2 }}>
            Note: Some ISPs or firewalls may block port scanning. Results may vary depending on your network configuration.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PortScanner;