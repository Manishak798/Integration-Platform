// @ts-nocheck
import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import { formatElapsedTime } from './utils/timeUtils';
import axios from 'axios';

const INTEGRATIONS = ['notion', 'hubspot', 'airtable'];

export const IntegrationManager = ({ user, org, refreshTrigger }) => {
    const [connectionStatuses, setConnectionStatuses] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [elapsedTimes, setElapsedTimes] = useState({});
    const [lastRefresh, setLastRefresh] = useState(0);

    // Fetch statuses when refreshTrigger changes
    useEffect(() => {
        const fetchStatuses = async () => {
            setIsLoading(true);
            console.log("Fetching connection statuses...");
            
            try {
                const integrations = ['notion', 'hubspot', 'airtable'];
                const statuses = {};
                
                for (const integration of integrations) {
                    const response = await fetch(
                        `http://localhost:8000/integrations/connection-info/${integration}?user_id=${user}&org_id=${org}`
                    );
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    console.log(`${integration} status:`, data);
                    
                    statuses[integration] = {
                        connected: data.connected,
                        connectedAt: data.connected_at,
                        credentials: data.credentials
                    };
                }
                
                console.log("All statuses:", statuses);
                setConnectionStatuses(statuses);
                
            } catch (error) {
                console.error("Error fetching connection statuses:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStatuses();
        // Poll every 5 seconds
        const interval = setInterval(fetchStatuses, 5000);
        return () => clearInterval(interval);
    }, [user, org, refreshTrigger]);

    // Listen for integration connection messages
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data === 'notion_connected' || 
                event.data === 'hubspot_connected' || 
                event.data === 'airtable_connected') {
                console.log('Integration connected, refreshing statuses...');
                setLastRefresh(Date.now()); // Trigger refresh
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Add this new effect to handle OAuth returns
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code && state) {
            const completeNotionAuth = async () => {
                try {
                    await axios.post('/api/notion/callback', {
                        code,
                        state,
                        user_id: user,
                        org_id: org
                    });
                    // Clear URL parameters
                    window.history.replaceState({}, '', window.location.pathname);
                    // Refresh connection statuses
                    await fetchConnectionStatuses();
                } catch (error) {
                    console.error('Error completing Notion authentication:', error);
                }
            };
            
            completeNotionAuth();
        }
    }, []);

    const fetchConnectionStatuses = async () => {
        try {
            setIsLoading(true);
            const response = await axios.get('/api/connection-status', {
                params: {
                    user_id: user,
                    org_id: org
                }
            });
            console.log('Connection statuses:', response.data);
            
            // Ensure the response data is properly formatted
            const formattedStatuses = {};
            Object.entries(response.data).forEach(([integration, status]) => {
                formattedStatuses[integration] = {
                    connected: status.connected,
                    connectedAt: status.connected_at || status.connectedAt
                };
            });
            
            setConnectionStatuses(formattedStatuses);
        } catch (error) {
            console.error('Error fetching connection statuses:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Update elapsed times
    useEffect(() => {
        const updateElapsedTimes = () => {
            const times = {};
            Object.entries(connectionStatuses).forEach(([integration, status]) => {
                if (status.connected && (status.connectedAt || status.connected_at)) {
                    times[integration] = formatElapsedTime(status.connectedAt || status.connected_at);
                }
            });
            setElapsedTimes(times);
        };

        updateElapsedTimes();
        const timer = setInterval(updateElapsedTimes, 1000);

        return () => clearInterval(timer);
    }, [connectionStatuses]);

    return (
        <Box sx={{ mt: 4 }}>
            <TableContainer component={Paper} sx={{ boxShadow: '0 4px 24px rgba(0, 0, 0, 0.05)' }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f7fa' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Integration</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Org ID</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Connected For</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {Object.entries(connectionStatuses).map(([integration, status]) => (
                            <TableRow key={integration}>
                                <TableCell sx={{ textTransform: 'capitalize' }}>
                                    {integration.charAt(0).toUpperCase() + integration.slice(1)}
                                </TableCell>
                                <TableCell>
                                    <Box
                                        component="span"
                                        sx={{
                                            px: 2,
                                            py: 0.5,
                                            borderRadius: '16px',
                                            backgroundColor: status.connected
                                                ? '#e8f5e9'
                                                : '#ffebee',
                                            color: status.connected
                                                ? '#2e7d32'
                                                : '#c62828',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        {status.connected ? 'Connected' : 'Disconnected'}
                                    </Box>
                                </TableCell>
                                <TableCell>{user}</TableCell>
                                <TableCell>{org}</TableCell>
                                <TableCell>
                                    {status.connected
                                        ? elapsedTimes[integration] || '-'
                                        : '-'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            {isLoading && <div>Loading...</div>}
        </Box>
    );
}; 