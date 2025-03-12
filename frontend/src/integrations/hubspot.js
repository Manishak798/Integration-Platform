// @ts-nocheck

import { useState, useEffect } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Alert,
    Snackbar
} from '@mui/material';
import axios from 'axios';
import { Logout } from '@mui/icons-material';
import { formatElapsedTime } from '../utils/timeUtils';

export const HubspotIntegration = ({ 
    user, 
    org, 
    integrationParams, 
    setIntegrationParams,
    isConnected,
    onConnectionChange,
    connectionInfoMap,
    setConnectionInfoMap,
    isConnectedMap,
    setIsConnectedMap
}) => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [localConnectionStatus, setLocalConnectionStatus] = useState(isConnected);
    const [connectionInfo, setConnectionInfo] = useState(null);
    const [elapsedTime, setElapsedTime] = useState('');
    const [toast, setToast] = useState({
        open: false,
        message: '',
        severity: 'success'
    });

    const showToast = (message, severity = 'success') => {
        setToast({
            open: true,
            message,
            severity
        });
    };

    const handleCloseToast = () => {
        setToast(prev => ({ ...prev, open: false }));
    };

    // Check connection status whenever isConnected prop changes
    useEffect(() => {
        setLocalConnectionStatus(isConnected);
    }, [isConnected]);

    // Fetch connection info when connected
    useEffect(() => {
        if (localConnectionStatus) {
            const fetchConnectionInfo = async () => {
                try {
                    const response = await fetch(
                        `http://localhost:8000/integrations/connection-info/hubspot?user_id=${user}&org_id=${org}`
                    );
                    const data = await response.json();
                    console.log('Hubspot connection info:', data);
                    if (data && data.connected) {
                        setConnectionInfo(data);
                    }
                } catch (error) {
                    console.error('Error fetching connection info:', error);
                }
            };
            fetchConnectionInfo();
        }
    }, [localConnectionStatus, user, org]);

    // Update timer every second
    useEffect(() => {
        let timer;
        if (connectionInfo?.connected_at) {
            timer = setInterval(() => {
                setElapsedTime(formatElapsedTime(connectionInfo.connected_at));
            }, 1000);
        }
        
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [connectionInfo]);

    // Debug logging
    useEffect(() => {
        console.log('Connection info updated:', connectionInfo);
        console.log('Is connected:', localConnectionStatus);
    }, [connectionInfo, localConnectionStatus]);

    // Function to open OAuth in a new window
    const handleConnectClick = async () => {
        try {
            setIsConnecting(true);
            showToast('Initiating HubSpot connection...', 'info');
            
            const formData = new FormData();
            formData.append('user_id', user);
            formData.append('org_id', org);
            const response = await axios.post(`http://localhost:8000/integrations/hubspot/authorize`, formData);
            const authURL = response?.data;

            const newWindow = window.open(authURL, 'HubSpot Authorization', 'width=600, height=600');

            if (newWindow) {
                const pollTimer = window.setInterval(() => {
                    if (newWindow?.closed !== false) { 
                        window.clearInterval(pollTimer);
                        handleWindowClosed();
                    }
                }, 200);
            } else {
                showToast('Failed to open authorization window', 'error');
                setIsConnecting(false);
            }
        } catch (e) {
            setIsConnecting(false);
            showToast(e?.response?.data?.detail || 'Failed to connect to HubSpot', 'error');
        }
    }

    // Function to handle logic when the OAuth window closes
    const handleWindowClosed = async () => {
        try {
            showToast('Retrieving HubSpot credentials...', 'info');
            const formData = new FormData();
            formData.append('user_id', user);
            formData.append('org_id', org);
            const response = await axios.post(`http://localhost:8000/integrations/hubspot/credentials`, formData);
            const credentials = response.data;
            
            if (credentials) {
                setIntegrationParams({
                    type: 'Hubspot', // Match exactly with integrationMapping
                    credentials: credentials
                });
                showToast('Successfully connected to HubSpot!', 'success');
            }
        } catch (e) {
            console.error('Hubspot credentials error:', e);
            showToast('Failed to get HubSpot credentials', 'error');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            const response = await fetch(
                `http://localhost:8000/integrations/disconnect/hubspot?user_id=${user}&org_id=${org}`,
                { method: 'POST' }
            );
            
            if (response.ok) {
                setLocalConnectionStatus(false);
                setConnectionInfo(null);
                setIntegrationParams(null);
                
                // Update the connection maps
                setConnectionInfoMap(prev => ({
                    ...prev,
                    hubspot: null
                }));
                
                // Add this line to update the isConnectedMap
                setIsConnectedMap(prev => ({
                    ...prev,
                    hubspot: false
                }));
                
                showToast('Successfully disconnected from HubSpot', 'success');
                
                if (onConnectionChange) {
                    onConnectionChange();
                }
                
                window.postMessage('integration_status_changed', '*');
            } else {
                console.error('Failed to disconnect');
                showToast('Failed to disconnect from HubSpot', 'error');
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            showToast('Error disconnecting from HubSpot', 'error');
        } finally {
            setIsDisconnecting(false);
        }
    };

    return (
        <Box sx={{mt: 2}}>
            {localConnectionStatus ? (
                <Box display="flex" flexDirection="column" alignItems="center">
                    <Box sx={{ 
                        bgcolor: '#2e7d32',
                        color: 'white',
                        py: 1,
                        px: 2,
                        borderRadius: 1,
                        mb: 2,
                        textAlign: 'center'
                    }}>
                        HUBSPOT CONNECTED
                    </Box>
                    {connectionInfo && (
                        <Box sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
                            Connected since: {formatElapsedTime(connectionInfo.connected_at)}
                        </Box>
                    )}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                            variant="outlined"
                            color="primary"
                            onClick={handleConnectClick}
                            disabled={isConnecting || isDisconnecting}
                            size="small"
                        >
                            {isConnecting ? <CircularProgress size={16} /> : 'RECONNECT'}
                        </Button>
                        <Button 
                            variant="outlined"
                            color="error"
                            onClick={handleDisconnect}
                            disabled={isConnecting || isDisconnecting}
                            size="small"
                            startIcon={isDisconnecting ? <CircularProgress size={16} /> : <Logout />}
                        >
                            DISCONNECT
                        </Button>
                    </Box>
                </Box>
            ) : (
                <Button 
                    variant="contained"
                    color="primary"
                    onClick={handleConnectClick}
                    disabled={isConnecting}
                    fullWidth
                >
                    {isConnecting ? <CircularProgress size={20} /> : 'CONNECT TO HUBSPOT'}
                </Button>
            )}

            <Snackbar
                open={toast.open}
                autoHideDuration={4000}
                onClose={handleCloseToast}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert 
                    onClose={handleCloseToast} 
                    severity={toast.severity}
                    sx={{ width: '100%' }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}