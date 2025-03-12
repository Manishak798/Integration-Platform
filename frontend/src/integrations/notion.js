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

export const NotionIntegration = ({ 
    user, 
    org, 
    integrationParams, 
    setIntegrationParams,
    isConnected,
    onConnectionChange
}) => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [localConnectionStatus, setLocalConnectionStatus] = useState(false);
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

    // Check connection status on mount and when isConnected prop changes
    useEffect(() => {
        const checkConnectionStatus = async () => {
            try {
                const response = await fetch(
                    `http://localhost:8000/integrations/connection-info/notion?user_id=${user}&org_id=${org}`
                );
                const data = await response.json();
                setLocalConnectionStatus(data.connected);
                if (data.connected) {
                    setConnectionInfo(data);
                }
            } catch (error) {
                console.error('Error checking connection status:', error);
                setLocalConnectionStatus(false);
            }
        };

        checkConnectionStatus();
    }, [user, org, isConnected]);

    // Add this useEffect for debugging
    useEffect(() => {
        console.log('Connection info updated:', connectionInfo);
        console.log('Is connected:', isConnected);
    }, [connectionInfo, isConnected]);

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

    const handleConnectClick = async () => {
        setIsConnecting(true);
        try {
            console.log('Starting Notion OAuth...');
            const formData = new FormData();
            formData.append('user_id', user);
            formData.append('org_id', org);
            
            const response = await axios.post(
                'http://localhost:8000/integrations/notion/authorize',
                formData,
                { 
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            );
            
            console.log('OAuth response:', response.data);
            
            if (response.data) {
                showToast('Redirecting to Notion authorization...', 'info');
                const authUrl = response.data;
                const newWindow = window.open(authUrl, '_blank', 'width=600,height=600');
                
                if (newWindow) {
                    const checkWindow = setInterval(() => {
                        if (newWindow.closed) {
                            clearInterval(checkWindow);
                            console.log('OAuth window closed, getting credentials...');
                            handleWindowClosed();
                        }
                    }, 1000);
                } else {
                    console.error('Failed to open OAuth window');
                    setIsConnecting(false);
                    showToast('Failed to open authorization window', 'error');
                }
            }
        } catch (e) {
            console.error('Notion OAuth error:', e);
            setIsConnecting(false);
            showToast(e?.response?.data?.detail || 'Failed to connect to Notion', 'error');
        }
    };

    const handleWindowClosed = async () => {
        try {
            console.log('Getting Notion credentials...');
            const formData = new FormData();
            formData.append('user_id', user);
            formData.append('org_id', org);
            
            const response = await axios.post(
                'http://localhost:8000/integrations/notion/credentials',
                formData,
                { 
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            );
            
            console.log('Credentials response:', response.data);
            
            if (response.data) {
                setIntegrationParams({
                    type: 'Notion',
                    credentials: response.data
                });
                showToast('Successfully connected to Notion!', 'success');
                console.log('Credentials set successfully');
            }
        } catch (e) {
            console.error('Notion credentials error:', e);
            showToast('Failed to get Notion credentials', 'error');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            const response = await fetch(
                `http://localhost:8000/integrations/disconnect/notion?user_id=${user}&org_id=${org}`,
                { method: 'POST' }
            );
            
            if (response.ok) {
                setLocalConnectionStatus(false);
                setConnectionInfo(null);
                setIntegrationParams(null);
                showToast('Successfully disconnected from Notion', 'success');
                
                if (onConnectionChange) {
                    onConnectionChange();
                }
                
                window.postMessage('integration_status_changed', '*');
            } else {
                console.error('Failed to disconnect');
                showToast('Failed to disconnect from Notion', 'error');
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            showToast('Error disconnecting from Notion', 'error');
        } finally {
            setIsDisconnecting(false);
        }
    };

    return (
        <Box sx={{mt: 2}}>
            <Box display='flex' flexDirection='column' alignItems='center' justifyContent='center' sx={{mt: 2}}>
                {localConnectionStatus ? (
                    <>
                        <Button 
                            variant='contained' 
                            color='success'
                            sx={{ mb: 1 }}
                            disabled={true}
                        >
                            NOTION CONNECTED
                        </Button>
                        <Box sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 1 }}>
                            Connected since: {formatElapsedTime(connectionInfo?.connected_at)}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button 
                                variant='outlined' 
                                color='primary'
                                onClick={handleConnectClick}
                                disabled={isConnecting || isDisconnecting}
                                size="small"
                            >
                                {isConnecting ? <CircularProgress size={16} /> : 'Reconnect'}
                            </Button>
                            <Button 
                                variant='outlined' 
                                color='error'
                                onClick={handleDisconnect}
                                disabled={isConnecting || isDisconnecting}
                                size="small"
                                startIcon={isDisconnecting ? <CircularProgress size={16} /> : <Logout />}
                            >
                                Disconnect
                            </Button>
                        </Box>
                    </>
                ) : (
                    <Button 
                        variant='contained' 
                        onClick={handleConnectClick}
                        disabled={isConnecting || isDisconnecting}
                    >
                        {isConnecting ? <CircularProgress size={20} /> : 'CONNECT TO NOTION'}
                    </Button>
                )}
            </Box>
            
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
};
