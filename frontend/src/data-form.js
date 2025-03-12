// @ts-nocheck
import 'antd/dist/reset.css';
import React, { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Typography
} from '@mui/material';
import axios from 'axios';
import { Table, Space, Tag, Tooltip } from 'antd';
import { FolderOutlined, FileOutlined, CopyOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { 
    CloudDownload, 
    Refresh, 
    Storage, 
    Clear 
} from '@mui/icons-material';

const endpointMapping = {
    'Notion': 'notion',
    'Airtable': 'airtable',
    'HubSpot': 'hubspot',
    'Hubspot': 'hubspot',
};

export const DataForm = ({ integrationType, credentials }) => {
    const [loadedData, setLoadedData] = useState(null);
    const [selectedApi, setSelectedApi] = useState('contacts');
    const [totalItems, setTotalItems] = useState(0);
    const endpoint = endpointMapping[integrationType];

    // Add HubSpot API options
    const hubspotApiOptions = [
        { value: 'contacts', label: 'Contacts' },
        { value: 'companies', label: 'Companies' },
        { value: 'deals', label: 'Deals' },
        { value: 'tickets', label: 'Tickets' }
    ];

    const handleLoad = async () => {
        try {
            console.log('Sending credentials:', credentials);
            
            const hubspotParams = integrationType.toLowerCase() === 'hubspot' ? `&api_type=${selectedApi}` : '';
            
            const response = await axios.post(
                `http://localhost:8000/integrations/${endpoint}/load?${hubspotParams}`, 
                { 
                    credentials: {
                        access_token: credentials.access_token,
                    },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            console.log('Data loaded: ', response.data);

            // Normalize the response data structure
            const normalizedData = integrationType.toLowerCase() === 'hubspot' 
                ? response.data.items 
                : response.data;

            setLoadedData(normalizedData);
        } catch (e) {
            console.error('Error payload:', e.response?.data);
            alert(e?.response?.data?.detail || 'An error occurred');
        }
    }

    const handleForceRefresh = async () => {
        try {
            console.log('Sending credentials for force refresh:', credentials);
            
            const hubspotParams = integrationType.toLowerCase() === 'hubspot' ? `&api_type=${selectedApi}` : '';
            
            const response = await axios.post(
                `http://localhost:8000/integrations/${endpoint}/load?force=true${hubspotParams}`, 
                { 
                    credentials: {
                        access_token: credentials.access_token,
                    },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            console.log('Force refreshed data: ', response.data);

            // Normalize the response data structure
            const normalizedData = integrationType.toLowerCase() === 'hubspot' 
                ? response.data.items 
                : response.data;

            setLoadedData(normalizedData);
        } catch (e) {
            console.error('Error payload:', e.response?.data);
            alert(e?.response?.data?.detail || 'An error occurred');
        }
    }

    // Helper function to check if string looks like a date
    const looksLikeDate = (str) => {
        return moment(str, [
            moment.ISO_8601,
            'YYYY-MM-DD',
            'DD/MM/YYYY',
            'MM/DD/YYYY',
            'YYYY/MM/DD'
        ], true).isValid();
    }

    // Helper function to format date
    const formatDate = (dateStr) => {
        return moment(dateStr).format('DD MMM YYYY hh:mm:ss A');
    }

    // Helper function to check if string is UUID
    const isUUID = (str) => {
        return typeof str === 'string' && 
               str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }

    // Helper function to format UUID
    const formatUUID = (uuid) => {
        const shortUUID = uuid.substring(0, 8); // Take first 8 characters
        return (
            <Tooltip title="Click to copy full ID">
                <span 
                    style={{ cursor: 'pointer', color: '#1890ff' }}
                    onClick={() => {
                        navigator.clipboard.writeText(uuid);
                        // Optional: Add a notification here that ID was copied
                    }}
                >
                    {shortUUID}... <CopyOutlined style={{ fontSize: '12px' }} />
                </span>
            </Tooltip>
        );
    }

    // Helper function to check if string is a URL
    const isURL = (str) => {
        try {
            return Boolean(new URL(str));
        } catch (e) {
            return false;
        }
    }

    // Helper function to format URL
    const formatURL = (url) => {
        return (
            <Tooltip title="Click to open link">
                <a 
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#1890ff' }}
                >
                    {url.length > 30 ? `${url.substring(0, 30)}...` : url} <LinkOutlined style={{ fontSize: '12px' }} />
                </a>
            </Tooltip>
        );
    }

    // Helper function to check if column is an ID field
    const isIDColumn = (columnName) => {
        return columnName.toLowerCase().includes('id') || 
               columnName.toLowerCase().includes('uuid') ||
               columnName.toLowerCase().includes('guid');
    }

    // Dynamically generate columns based on the first item in the data
    const generateColumns = (data) => {
        if (!data || data.length === 0) return [];

        const firstItem = data[0];
        const columns = [];

        // Add columns for top-level fields
        Object.keys(firstItem).forEach(key => {
            if (key !== 'properties' && key !== 'children') {
                columns.push({
                    title: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                    dataIndex: key,
                    key: key,
                    render: (text) => {
                        if (text === null || text === undefined) return '-';
                        if (typeof text === 'boolean') return text.toString();
                        if (looksLikeDate(text)) return formatDate(text);
                        if (isUUID(text)) return formatUUID(text);
                        if (isURL(text)) return formatURL(text);
                        if (isIDColumn(key) && typeof text === 'string') return formatUUID(text);
                        return text;
                    }
                });
            }
        });

        // Add columns for properties if they exist
        if (firstItem.properties) {
            Object.keys(firstItem.properties).forEach(key => {
                columns.push({
                    title: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                    dataIndex: ['properties', key],
                    key: `properties_${key}`,
                    render: (text) => {
                        if (text === null || text === undefined) return '-';
                        if (typeof text === 'boolean') return text.toString();
                        if (looksLikeDate(text)) return formatDate(text);
                        if (isUUID(text)) return formatUUID(text);
                        if (isURL(text)) return formatURL(text);
                        if (isIDColumn(key) && typeof text === 'string') return formatUUID(text);
                        return text;
                    }
                });
            });
        }

        return columns;
    };

    // Helper function to export data to Excel
    const exportToExcel = () => {
        if (!loadedData || loadedData.length === 0) return;

        // Flatten the data to handle nested properties
        const flattenedData = loadedData.map(item => {
            const flatItem = { ...item };
            
            // Remove nested objects that we don't want to export
            delete flatItem.children;
            
            // Flatten properties if they exist
            if (flatItem.properties) {
                Object.entries(flatItem.properties).forEach(([key, value]) => {
                    flatItem[key] = value;
                });
                delete flatItem.properties;
            }

            // Format dates and UUIDs in the exported data
            Object.entries(flatItem).forEach(([key, value]) => {
                if (looksLikeDate(value)) {
                    flatItem[key] = formatDate(value);
                } else if (isUUID(value)) {
                    flatItem[key] = value; // Keep full UUID in Excel
                }
            });

            return flatItem;
        });

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(flattenedData);
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");

        // Generate filename with timestamp
        const fileName = `${integrationType}_data_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        // Save file
        XLSX.writeFile(wb, fileName);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* API Selection buttons */}
            <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Select {integrationType} API:</Typography>
                {integrationType.toLowerCase() === 'hubspot' && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {hubspotApiOptions.map((option) => (
                            <Button
                                key={option.value}
                                variant={selectedApi === option.value ? "contained" : "outlined"}
                                onClick={() => setSelectedApi(option.value)}
                                sx={{
                                    textTransform: 'none',
                                    borderRadius: '8px',
                                    minWidth: '100px',
                                    ...(selectedApi === option.value
                                        ? {
                                            backgroundColor: '#3182ce',
                                            '&:hover': {
                                                backgroundColor: '#2c5282',
                                            },
                                        }
                                        : {
                                            color: '#718096',
                                            borderColor: '#718096',
                                        })
                                }}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </Box>
                )}
            </Box>

            {/* Data Info Section */}
            <Box sx={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 16px',
            }}>
                <Typography variant="body2" color="text.secondary">
                    {loadedData?.length > 0 ? (
                        <>
                            Loaded Items: <strong>{loadedData.length} items loaded</strong>
                            {integrationType.toLowerCase() === 'hubspot' && (
                                <span> (Total available: {totalItems})</span>
                            )}
                        </>
                    ) : (
                        <span style={{ color: '#e53e3e' }}>Did not find any data for this search request</span>
                    )}
                </Typography>
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                    variant="contained"
                    startIcon={<Storage />}
                    onClick={handleLoad}
                    sx={{
                        backgroundColor: '#3182ce',
                        '&:hover': {
                            backgroundColor: '#2c5282',
                        },
                        minWidth: '140px',
                        borderRadius: '8px',
                        textTransform: 'none',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                >
                    Load Data
                </Button>

                <Button
                    variant="contained"
                    startIcon={<Refresh />}
                    onClick={handleForceRefresh}
                    sx={{
                        backgroundColor: '#ed8936',
                        '&:hover': {
                            backgroundColor: '#dd6b20',
                        },
                        minWidth: '140px',
                        borderRadius: '8px',
                        textTransform: 'none',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                >
                    Force Refresh
                </Button>

                <Button
                    variant="contained"
                    startIcon={<CloudDownload />}
                    onClick={exportToExcel}
                    sx={{
                        backgroundColor: '#38a169',
                        '&:hover': {
                            backgroundColor: '#2f855a',
                        },
                        minWidth: '140px',
                        borderRadius: '8px',
                        textTransform: 'none',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                >
                    Export to Excel
                </Button>

                <Button
                    variant="outlined"
                    startIcon={<Clear />}
                    onClick={() => setLoadedData(null)}
                    sx={{
                        color: '#718096',
                        borderColor: '#718096',
                        '&:hover': {
                            backgroundColor: 'rgba(113,128,150,0.04)',
                            borderColor: '#4a5568',
                            color: '#4a5568',
                        },
                        minWidth: '140px',
                        borderRadius: '8px',
                        textTransform: 'none',
                    }}
                >
                    Clear Data
                </Button>
            </Box>

            {/* Data Display Section */}
            {loadedData && loadedData.length > 0 ? (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="h6" sx={{ 
                        color: '#1a202c',
                        mb: 2,
                        fontWeight: 500 
                    }}>
                        {integrationType} Data
                    </Typography>
                    <Table 
                        columns={generateColumns(loadedData)}
                        dataSource={loadedData}
                        rowKey="id"
                        pagination={{ 
                            pageSize: 10,
                            style: { marginTop: '16px' }
                        }}
                        style={{ 
                            marginTop: '16px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        bordered={false}
                        size="middle"
                        scroll={{ x: true }}
                        onRow={(record) => ({
                            style: {
                                cursor: 'pointer',
                            }
                        })}
                        components={{
                            header: {
                                cell: props => (
                                    <th
                                        {...props}
                                        style={{
                                            background: '#f8f9fa',
                                            color: '#495057',
                                            fontWeight: 600,
                                            padding: '16px',
                                        }}
                                    />
                                )
                            },
                            body: {
                                cell: props => (
                                    <td
                                        {...props}
                                        style={{
                                            padding: '16px',
                                        }}
                                    />
                                ),
                                row: props => (
                                    <tr
                                        {...props}
                                        style={{
                                            '&:hover': {
                                                background: '#f1f3f5',
                                            }
                                        }}
                                    />
                                )
                            }
                        }}
                    />
                </Box>
            ) : (
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '48px 20px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px dashed #cbd5e0',
                    mt: 2,
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                }}>
                    <Storage sx={{ 
                        fontSize: 64, 
                        color: '#a0aec0',
                        mb: 2
                    }} />
                    <Typography variant="h6" sx={{ 
                        color: '#4a5568',
                        mb: 1,
                        fontWeight: 500
                    }}>
                        No Data Available
                    </Typography>
                    <Typography variant="body2" sx={{ 
                        color: '#718096',
                        textAlign: 'center',
                        maxWidth: '400px'
                    }}>
                        Click "Load Data" to fetch your {integrationType} data, or use "Force Refresh" to get the latest updates.
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

export default DataForm;
