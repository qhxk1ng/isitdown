import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Grid,
  TextField,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper,
  Divider,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Slider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import TerminalIcon from '@mui/icons-material/Terminal';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PublicIcon from '@mui/icons-material/Public';
import SpeedIcon from '@mui/icons-material/Speed';
import LanguageIcon from '@mui/icons-material/Language';

// Home Component
const Home = () => {
  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
      <Typography variant="h2" component="h1" gutterBottom sx={{ 
        fontWeight: 800, 
        color: '#071129',
        mb: 4,
        background: 'linear-gradient(45deg, #1976d2 30%, #21CBF3 90%)',
        backgroundClip: 'text',
        textFillColor: 'transparent',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Isitdown?
      </Typography>
      
      <Typography variant="h5" color="text.secondary" paragraph sx={{ mb: 6 }}>
        Free Online Service Checker, Port Scanner & HTTP Tester
      </Typography>

      <Grid container spacing={4} sx={{ mb: 8 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', boxShadow: 3, transition: 'transform 0.3s', '&:hover': { transform: 'translateY(-8px)' } }}>
            <CardContent sx={{ p: 4 }}>
              <TerminalIcon sx={{ fontSize: 60, color: '#1976d2', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Curl Tool
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Send HTTP requests, set custom headers, and inspect responses with our curl-like interface.
              </Typography>
              <Button
                variant="contained"
                component={Link}
                to="/curl"
                sx={{ mt: 2 }}
              >
                Try Curl Tool
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', boxShadow: 3, transition: 'transform 0.3s', '&:hover': { transform: 'translateY(-8px)' } }}>
            <CardContent sx={{ p: 4 }}>
              <NetworkCheckIcon sx={{ fontSize: 60, color: '#1976d2', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Port Scanner
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Check if ports are open or closed on any host. Perfect for testing firewall rules and port forwarding.
              </Typography>
              <Button
                variant="contained"
                component={Link}
                to="/port-scan"
                sx={{ mt: 2 }}
              >
                Scan Ports
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', boxShadow: 3, transition: 'transform 0.3s', '&:hover': { transform: 'translateY(-8px)' } }}>
            <CardContent sx={{ p: 4 }}>
              <SearchIcon sx={{ fontSize: 60, color: '#1976d2', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Status Checker
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Quickly check if a website or server is up. Test HTTP endpoints and monitor service availability.
              </Typography>
              <Button
                variant="contained"
                component={Link}
                to="/status"
                sx={{ mt: 2 }}
              >
                Check Status
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ bgcolor: '#f8f9fa', p: 4, borderRadius: 2 }}>
        <Typography variant="h4" gutterBottom sx={{ color: '#071129' }}>
          Why Choose Isitdown?
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <SpeedIcon sx={{ fontSize: 40, color: '#1976d2', mb: 2 }} />
              <Typography variant="h6" gutterBottom>Fast & Reliable</Typography>
              <Typography variant="body2">Quick checks with real-time results. No waiting, no delays.</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <LanguageIcon sx={{ fontSize: 40, color: '#1976d2', mb: 2 }} />
              <Typography variant="h6" gutterBottom>No Installation</Typography>
              <Typography variant="body2">Everything runs in your browser. No downloads or setup required.</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <PublicIcon sx={{ fontSize: 40, color: '#1976d2', mb: 2 }} />
              <Typography variant="h6" gutterBottom>Free Forever</Typography>
              <Typography variant="body2">Completely free to use. No hidden fees or premium plans.</Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>
    </Box>
  );
};

// Curl Tool Component
const CurlTool = () => {
  const [url, setUrl] = useState('https://api.github.com');
  const [method, setMethod] = useState('GET');
  const [headers, setHeaders] = useState([{ key: 'User-Agent', value: 'Isitdown-Curl-Tool/1.0' }]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');
  const [verbose, setVerbose] = useState(false);
  const [timeout, setTimeout] = useState(10);

  const handleSendRequest = async () => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const headersObj = {};
      headers.forEach(header => {
        if (header.key.trim()) {
          headersObj[header.key.trim()] = header.value.trim();
        }
      });

      const requestBody = {
        url,
        method,
        headers: headersObj,
        timeout,
        verbose,
      };

      if (body.trim() && ['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
          JSON.parse(body);
          requestBody.body = body;
        } catch {
          // If not valid JSON, send as plain text
          requestBody.body = body;
        }
      }

      const response = await fetch('/api/http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Request failed');
      }

      setResponse(data);
    } catch (err) {
      setError(err.message || 'Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const updateHeader = (index, field, value) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const removeHeader = (index) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    setHeaders(newHeaders);
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600, color: '#1976d2' }}>
        Curl Tool - HTTP Tester
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        Send HTTP requests and inspect responses. Perfect for API testing and debugging.
      </Typography>

      <Card sx={{ mb: 4, boxShadow: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/endpoint"
                variant="outlined"
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Method</InputLabel>
                <Select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  label="Method"
                >
                  <MenuItem value="GET">GET</MenuItem>
                  <MenuItem value="POST">POST</MenuItem>
                  <MenuItem value="PUT">PUT</MenuItem>
                  <MenuItem value="DELETE">DELETE</MenuItem>
                  <MenuItem value="PATCH">PATCH</MenuItem>
                  <MenuItem value="HEAD">HEAD</MenuItem>
                  <MenuItem value="OPTIONS">OPTIONS</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Request Headers</Typography>
              {headers.map((header, index) => (
                <Grid container spacing={2} key={index} sx={{ mb: 2 }}>
                  <Grid item xs={5}>
                    <TextField
                      fullWidth
                      placeholder="Header Name"
                      value={header.key}
                      onChange={(e) => updateHeader(index, 'key', e.target.value)}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={5}>
                    <TextField
                      fullWidth
                      placeholder="Header Value"
                      value={header.value}
                      onChange={(e) => updateHeader(index, 'value', e.target.value)}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <Button
                      color="error"
                      onClick={() => removeHeader(index)}
                      size="small"
                    >
                      Remove
                    </Button>
                  </Grid>
                </Grid>
              ))}
              <Button onClick={addHeader} variant="outlined" size="small">
                Add Header
              </Button>
            </Grid>

            {['POST', 'PUT', 'PATCH'].includes(method) && (
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>Request Body</Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  variant="outlined"
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={4}>
                  <Typography gutterBottom>Timeout: {timeout} seconds</Typography>
                  <Slider
                    value={timeout}
                    onChange={(e, newValue) => setTimeout(newValue)}
                    min={1}
                    max={30}
                    step={1}
                    valueLabelDisplay="auto"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={verbose}
                        onChange={(e) => setVerbose(e.target.checked)}
                      />
                    }
                    label="Verbose Response"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleSendRequest}
                    disabled={loading}
                    fullWidth
                  >
                    {loading ? <CircularProgress size={24} /> : 'Send Request'}
                  </Button>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {response && (
        <Card sx={{ boxShadow: 3 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom sx={{ color: '#1976d2' }}>
              Response
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Status Code: <Chip 
                      label={response.status_code} 
                      color={response.status_code < 400 ? "success" : "error"}
                      size="small"
                    />
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Response Headers</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Header</strong></TableCell>
                            <TableCell><strong>Value</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(response.headers || {}).map(([key, value]) => (
                            <TableRow key={key}>
                              <TableCell>{key}</TableCell>
                              <TableCell>{value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              </Grid>

              <Grid item xs={12}>
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Response Body</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ 
                      p: 2, 
                      bgcolor: '#f8f9fa', 
                      borderRadius: 1,
                      maxHeight: 400,
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem'
                    }}>
                      <pre style={{ margin: 0 }}>
                        {typeof response.body === 'string' 
                          ? response.body 
                          : JSON.stringify(response.body, null, 2)}
                      </pre>
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

// Port Scanner Component
const PortScanner = () => {
  const [clientIP, setClientIP] = useState('');
  const [port, setPort] = useState('80');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [scanHistory, setScanHistory] = useState([]);

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

  const otherApps = [
    { name: 'Minecraft', port: 25565 },
    { name: 'Steam', port: 27015 },
    { name: 'TeamSpeak', port: 9987 },
    { name: 'Discord Voice', port: 64738 },
  ];

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
        A free utility for remotely verifying if a port is open or closed. Useful for verifying port forwarding and checking if a server is running or a firewall/ISP is blocking certain ports.
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

// Status Checker Component
const StatusChecker = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const checkStatus = async () => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.startsWith('http') ? url : `https://${url}`,
          method: 'GET',
          timeout: 10,
          verbose: false
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Check failed');
      }

      setResult({
        url,
        statusCode: data.status_code,
        timestamp: new Date().toLocaleString(),
        headers: data.headers,
        bodyPreview: data.body?.substring(0, 200) || ''
      });
    } catch (err) {
      setError(err.message || 'Failed to check status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600, color: '#1976d2' }}>
        Status Checker
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        Quickly check if a website or server is up and running.
      </Typography>

      <Card sx={{ mb: 4, boxShadow: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="Website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com or https://example.com"
                variant="outlined"
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={checkStatus}
                disabled={loading}
                fullWidth
                sx={{ py: 1.5 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Check Status'}
              </Button>
            </Grid>
          </Grid>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card sx={{ boxShadow: 3 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom sx={{ color: '#1976d2' }}>
              Status Result
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    URL: {result.url}
                  </Typography>
                  <Typography variant="body1">
                    Checked at: {result.timestamp}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Box sx={{ 
                  p: 3, 
                  borderRadius: 1,
                  border: '2px solid',
                  borderColor: result.statusCode < 400 ? 'success.main' : 'error.main',
                  bgcolor: result.statusCode < 400 ? 'success.light' : 'error.light'
                }}>
                  <Grid container alignItems="center" spacing={2}>
                    <Grid item>
                      {result.statusCode < 400 ? (
                        <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main' }} />
                      ) : (
                        <CancelIcon sx={{ fontSize: 60, color: 'error.main' }} />
                      )}
                    </Grid>
                    <Grid item>
                      <Typography variant="h4">
                        Status: {result.statusCode < 400 ? 'UP' : 'DOWN'}
                      </Typography>
                      <Typography variant="h6">
                        HTTP Status: {result.statusCode}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              </Grid>

              {result.headers && (
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Response Headers</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell><strong>Header</strong></TableCell>
                              <TableCell><strong>Value</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {Object.entries(result.headers).slice(0, 10).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableCell>{key}</TableCell>
                                <TableCell>{value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mt: 4, bgcolor: '#f8f9fa', boxShadow: 1 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
            Common Status Codes
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#e8f5e9' }}>
                <Typography variant="h6" color="success.main">200 OK</Typography>
                <Typography variant="body2">Successful request</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fff3e0' }}>
                <Typography variant="h6" color="warning.main">301/302</Typography>
                <Typography variant="body2">Redirect</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#ffebee' }}>
                <Typography variant="h6" color="error.main">404</Typography>
                <Typography variant="body2">Not Found</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#ffebee' }}>
                <Typography variant="h6" color="error.main">500</Typography>
                <Typography variant="body2">Server Error</Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};

// Main App Component
function App() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const menuItems = [
    { text: 'Home', path: '/', icon: <HomeIcon /> },
    { text: 'Curl Tool', path: '/curl', icon: <TerminalIcon /> },
    { text: 'Port Scanner', path: '/port-scan', icon: <NetworkCheckIcon /> },
    { text: 'Status Checker', path: '/status', icon: <SearchIcon /> },
  ];

  const drawer = (
    <List>
      {menuItems.map((item) => (
        <ListItem
          button
          key={item.text}
          component={Link}
          to={item.path}
          onClick={() => setMobileOpen(false)}
        >
          <Box sx={{ mr: 2 }}>{item.icon}</Box>
          <ListItemText primary={item.text} />
        </ListItem>
      ))}
    </List>
  );

  return (
    <Router>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AppBar position="static" sx={{ bgcolor: '#071129' }}>
          <Toolbar>
            {isMobile && (
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
              <Link to="/" style={{ color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                <Box component="span" sx={{ 
                  bgcolor: '#1976d2', 
                  px: 1.5, 
                  py: 0.5, 
                  borderRadius: 1,
                  mr: 1 
                }}>
                  Isitdown?
                </Box>
              </Link>
            </Typography>

            {!isMobile && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                {menuItems.map((item) => (
                  <Button
                    key={item.text}
                    color="inherit"
                    component={Link}
                    to={item.path}
                    startIcon={item.icon}
                    sx={{ fontWeight: 500 }}
                  >
                    {item.text}
                  </Button>
                ))}
              </Box>
            )}
          </Toolbar>
        </AppBar>

        <Drawer
          variant="temporary"
          anchor="left"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
          }}
        >
          {drawer}
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, py: 4, bgcolor: '#f5f7fa' }}>
          <Container maxWidth="xl">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/curl" element={<CurlTool />} />
              <Route path="/port-scan" element={<PortScanner />} />
              <Route path="/status" element={<StatusChecker />} />
            </Routes>
          </Container>
        </Box>

        <Box
          component="footer"
          sx={{
            py: 3,
            px: 2,
            mt: 'auto',
            backgroundColor: '#071129',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ color: 'white' }}>
                  Isitdown?
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  A free online toolkit for developers, network administrators, and IT professionals.
                  Check website status, scan ports, and test HTTP requests with our easy-to-use tools.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ color: 'white' }}>
                  Quick Links
                </Typography>
                <Grid container spacing={1}>
                  {menuItems.map((item) => (
                    <Grid item xs={6} key={item.text}>
                      <Link 
                        to={item.path} 
                        style={{ 
                          color: 'rgba(255,255,255,0.7)', 
                          textDecoration: 'none',
                          fontSize: '0.9rem'
                        }}
                      >
                        {item.text}
                      </Link>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>
            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />
            <Typography variant="body2" align="center" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              © {new Date().getFullYear()} Isitdown? - Free Online Service Checker. All tools are free to use.
            </Typography>
          </Container>
        </Box>
      </Box>
    </Router>
  );
}

export default App;