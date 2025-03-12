// @ts-nocheck
import { useState, useEffect } from 'react';
import {
    Box,
    Autocomplete,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
} from '@mui/material';
import { AirtableIntegration } from './integrations/airtable';
import { NotionIntegration } from './integrations/notion';
import { HubspotIntegration } from './integrations/hubspot';
import { DataForm } from './data-form';
import { IntegrationManager } from './integration-manager';

const integrationMapping = {
    'Notion': NotionIntegration,
    'Airtable (Coming Soon)': AirtableIntegration,
    'Hubspot': HubspotIntegration,
};

export const IntegrationForm = () => {
    const [user, setUser] = useState('TestUser');
    const [org, setOrg] = useState('TestOrg');
    const [currType, setCurrType] = useState(null);
    const [paramsPerType, setParamsPerType] = useState({});
    const [isConnectedMap, setIsConnectedMap] = useState({});
    const [connectionInfoMap, setConnectionInfoMap] = useState({});
    const [lastRefresh, setLastRefresh] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Function to check connection status
    const checkConnectionStatus = async () => {
        if (!currType) return;
        try {
            const response = await fetch(
                `http://localhost:8000/integrations/connection-info/${currType.toLowerCase()}?user_id=${user}&org_id=${org}`
            );
            const data = await response.json();
            setIsConnectedMap(prev => ({
                ...prev,
                [currType]: data.connected
            }));
            // Store the full connection info including credentials
            if (data.connected && data.credentials) {
                setConnectionInfoMap(prev => ({
                    ...prev,
                    [currType]: data
                }));
            }
        } catch (error) {
            console.error('Error checking connection status:', error);
        }
    };

    // Check connection status when type changes or on refresh
    useEffect(() => {
        checkConnectionStatus();
    }, [currType, lastRefresh]);

    // Listen for connection messages
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data === 'notion_connected' || 
                event.data === 'hubspot_connected' || 
                event.data === 'airtable_connected') {
                setLastRefresh(Date.now());
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Add effect to listen for global refresh messages
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data === 'integration_status_changed') {
                setRefreshTrigger(prev => prev + 1);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Add new effect to check all connection statuses when refreshTrigger changes
    useEffect(() => {
        const checkAllConnectionStatuses = async () => {
            // Check status for all integration types
            for (const type of Object.keys(integrationMapping)) {
                try {
                    const response = await fetch(
                        `http://localhost:8000/integrations/connection-info/${type.toLowerCase()}?user_id=${user}&org_id=${org}`
                    );
                    const data = await response.json();
                    setIsConnectedMap(prev => ({
                        ...prev,
                        [type]: data.connected
                    }));
                    if (data.connected && data.credentials) {
                        setConnectionInfoMap(prev => ({
                            ...prev,
                            [type]: data
                        }));
                    }
                } catch (error) {
                    console.error(`Error checking connection status for ${type}:`, error);
                }
            }
        };

        checkAllConnectionStatuses();
    }, [refreshTrigger, user, org]);

    const handleSetIntegrationParams = (params) => {
        if (params?.type) {
            setParamsPerType(prev => ({
                ...prev,
                [params.type]: params
            }));
            
            // Update connection status when credentials change
            if (params.credentials) {
                setIsConnectedMap(prev => ({
                    ...prev,
                    [params.type]: true
                }));
            }
        }
    };

    const handleConnectionChange = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const CurrIntegration = integrationMapping[currType];

    const headingStyles = {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        letterSpacing: '-0.01em',
        color: '#1a2b3b',
    };

    return (
        <Box sx={{ 
            width: '100%',
            minHeight: '100vh',
            padding: {
                xs: '12px',
                sm: '16px',
                md: '20px'
            },
            background: 'linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%)',
        }}>
            {/* Widget Container */}
            <Box sx={{
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(20px)',
                borderRadius: '16px',
                boxShadow: `
                    0 10px 25px -5px rgba(0, 0, 0, 0.05),
                    0 20px 45px -10px rgba(0, 0, 0, 0.08),
                    0 0 0 1px rgba(0, 0, 0, 0.02)
                `,
                padding: {
                    xs: '16px',
                    sm: '20px',
                    md: '24px'
                },
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                border: '1px solid rgba(255, 255, 255, 0.7)',
            }}>
                {/* Main Content Area */}
                <Box sx={{ 
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: '1fr',
                        md: '320px 1fr'
                    },
                    gap: '20px',
                    minHeight: '600px',
                }}>
                    {/* Left Column - Settings */}
                    <Box sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        borderRadius: '12px',
                        boxShadow: `
                            0 4px 6px -1px rgba(0, 0, 0, 0.03),
                            0 2px 4px -1px rgba(0, 0, 0, 0.02)
                        `,
                        padding: '20px',
                        height: '100%',
                        border: '1px solid rgba(255, 255, 255, 0.9)',
                    }}>
                        <Typography 
                            variant="h5" 
                            sx={{ 
                                ...headingStyles,
                                mb: 3,
                                fontSize: '1.25rem',
                                fontWeight: 600,
                                background: 'linear-gradient(45deg, #1a2b3b 30%, #2a3b4b 90%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            Integration Settings
                        </Typography>
                        
                        {/* Form Fields with Enhanced Styling */}
                        <Box sx={{
                            '& .MuiTextField-root, & .MuiSelect-root': {
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    borderRadius: '12px',
                                    transition: 'all 0.2s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: 'white',
                                    },
                                    '& fieldset': {
                                        borderColor: 'rgba(0, 0, 0, 0.08)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#3182ce',
                                    }
                                }
                            }
                        }}>
                            <TextField
                                fullWidth
                                label="User"
                                value={user}
                                onChange={(e) => setUser(e.target.value)}
                            />
                            <TextField
                                fullWidth
                                label="Organization"
                                value={org}
                                onChange={(e) => setOrg(e.target.value)}
                            />
                            <FormControl fullWidth>
                                <InputLabel>Integration Type</InputLabel>
                                <Select
                                    value={currType || ''}
                                    onChange={(e) => setCurrType(e.target.value)}
                                >
                                    {Object.keys(integrationMapping).map((type) => (
                                        <MenuItem key={type} value={type}>{type}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {currType && (
                                <Box sx={{ mt: 4 }}>
                                    <Typography 
                                        variant="h6" 
                                        sx={{ 
                                            ...headingStyles,
                                            mt: 4,
                                            mb: 2,
                                            fontSize: '1.1rem',
                                            fontWeight: 500,
                                            color: '#4a5568',
                                        }}
                                    >
                                        Parameters
                                    </Typography>
                                    {currType === 'Notion' && (
                                        <NotionIntegration
                                            user={user}
                                            org={org}
                                            integrationParams={paramsPerType[currType]}
                                            setIntegrationParams={(params) => handleSetIntegrationParams(params)}
                                            isConnected={isConnectedMap[currType]}
                                            onConnectionChange={handleConnectionChange}
                                        />
                                    )}
                                    {currType !== 'Notion' && (
                                        <CurrIntegration
                                            user={user}
                                            org={org}
                                            integrationParams={paramsPerType[currType] || {}}
                                            setIntegrationParams={handleSetIntegrationParams}
                                            isConnected={isConnectedMap[currType] || false}
                                            setConnectionInfoMap={setConnectionInfoMap}
                                            connectionInfoMap={connectionInfoMap}
                                            isConnectedMap={isConnectedMap}
                                            setIsConnectedMap={setIsConnectedMap}
                                            onConnectionChange={handleConnectionChange}
                                        />
                                    )}
                                </Box>
                            )}
                        </Box>
                    </Box>

                    {/* Right Column - Data View */}
                    <Box sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        borderRadius: '12px',
                        boxShadow: `
                            0 4px 6px -1px rgba(0, 0, 0, 0.03),
                            0 2px 4px -1px rgba(0, 0, 0, 0.02)
                        `,
                        padding: '20px',
                        height: '100%',
                        border: '1px solid rgba(255, 255, 255, 0.9)',
                    }}>
                        <Box sx={{ position: 'relative', zIndex: 1, height: '100%' }}>
                            <Typography 
                                variant="h5" 
                                sx={{ 
                                    ...headingStyles,
                                    mb: 3,
                                    fontSize: '1.25rem',
                                    fontWeight: 600,
                                    background: 'linear-gradient(45deg, #1a2b3b 30%, #2a3b4b 90%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                Data View
                            </Typography>
                            <Box sx={{ 
                                overflowX: 'auto',
                                overflowY: 'auto',
                                flexGrow: 1,
                                '& .MuiTable-root': {
                                    minWidth: '1200px',
                                }
                            }}>
                                {isConnectedMap[currType] ? (
                                    <DataForm
                                        integrationType={currType}
                                        credentials={connectionInfoMap[currType]?.credentials}
                                    />
                                ) : (
                                    <Box sx={{ 
                                        display: 'flex', 
                                        justifyContent: 'center', 
                                        alignItems: 'center',
                                        height: '100%',
                                        flexDirection: 'column',
                                        gap: 2,
                                        background: 'rgba(255,255,255,0.7)',
                                        borderRadius: '8px',
                                        padding: '32px',
                                        backdropFilter: 'blur(4px)',
                                    }}>
                                        <Typography 
                                            variant="h6" 
                                            sx={{ 
                                                ...headingStyles,
                                                color: '#4a5568',
                                                fontSize: '1.1rem',
                                                fontWeight: 500,
                                            }}
                                        >
                                            Connect to {currType} to view data
                                        </Typography>
                                        <Typography 
                                            variant="body2" 
                                            sx={{ 
                                                color: '#718096',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            Use the Parameters section to establish connection
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* Bottom Section - Connection Dashboard */}
                <Box sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    borderRadius: '12px',
                    boxShadow: `
                        0 4px 6px -1px rgba(0, 0, 0, 0.03),
                        0 2px 4px -1px rgba(0, 0, 0, 0.02)
                    `,
                    padding: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.9)',
                }}>
                    <Typography 
                        variant="h5" 
                        sx={{ 
                            ...headingStyles,
                            mb: 3,
                            fontSize: '1.25rem',
                            fontWeight: 600,
                            background: 'linear-gradient(45deg, #1a2b3b 30%, #2a3b4b 90%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Connection Dashboard
                    </Typography>
                    <IntegrationManager 
                        user={user} 
                        org={org} 
                        refreshTrigger={refreshTrigger}
                    />
                </Box>
            </Box>
        </Box>
    );
}
