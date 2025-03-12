from fastapi import APIRouter, HTTPException, Request, Form
from typing import Dict, Any
from pydantic import BaseModel
import logging
import json
from cache import cache, Cache
from integrations.hubspot import get_items_hubspot, authorize_hubspot, get_hubspot_credentials
from integrations.notion import get_items_notion, authorize_notion, get_notion_credentials
from integrations.airtable import get_items_airtable, authorize_airtable, get_airtable_credentials
from redis_client import delete_key_redis, get_value_redis, add_key_value_redis
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

router = APIRouter()

class CredentialsModel(BaseModel):
    credentials: Dict[str, Any]

@router.post("/{integration_type}/load")
async def load_integration_data(
    request: Request,
    integration_type: str,
    credentials: CredentialsModel,
    force: bool = False,
    api_type: str = None  # New parameter for HubSpot API type
):
    """Load integration data with caching"""
    try:
        # Debug logs
        logger.debug(f"Integration type: {integration_type}")
        logger.debug(f"Force refresh: {force}")
        logger.debug(f"API type: {api_type}")
        logger.debug(f"Credentials received: {credentials.credentials}")
        
        # Convert credentials to JSON string for HubSpot
        creds_str = json.dumps(credentials.credentials)
        
        # Create cache key that includes the API type for HubSpot
        cache_key = f"{integration_type}_{api_type}" if integration_type == "hubspot" and api_type else integration_type
        
        # If not forcing refresh, try to get cached data first
        if not force:
            cached_data = await cache.get_data(cache_key, credentials.credentials)
            if cached_data:
                logger.debug("Returning cached data")
                return cached_data

        # Load fresh data from integration
        logger.debug("Loading fresh data from integration")
        data = await load_data_from_integration(integration_type, creds_str, api_type)  # Pass api_type
        
        # Cache the fresh data
        logger.debug("Caching fresh data")
        await cache.set_data(cache_key, credentials.credentials, data)
        
        return data
    except Exception as e:
        logger.error(f"Error in load_integration_data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def load_data_from_integration(integration_type: str, credentials: str, api_type: str = None):
    """Load fresh data from integration"""
    try:
        logger.debug(f"Loading data for integration: {integration_type}")
        logger.debug(f"Using credentials: {credentials}")
        logger.debug(f"API type: {api_type}")
        
        if integration_type == "hubspot":
            if not api_type:
                raise HTTPException(status_code=400, detail="API type is required for HubSpot integration")
            if api_type not in ["contacts", "companies", "deals", "tickets"]:
                raise HTTPException(status_code=400, detail=f"Unsupported HubSpot API type: {api_type}")
            return await get_items_hubspot(credentials, api_type)  # Pass api_type to HubSpot function
        elif integration_type == "notion":
            return await get_items_notion(credentials)
        elif integration_type == "airtable":
            return await get_items_airtable(credentials)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported integration type: {integration_type}"
            )
    except Exception as e:
        logger.error(f"Error in load_data_from_integration: {str(e)}")
        raise 

@router.post("/notion/load")
async def load_notion_data(credentials: str = Form(...)):
    """Load data from Notion with caching"""
    try:
        cache = Cache()
        cached_data = await cache.get_data("notion", json.loads(credentials))
        
        if cached_data:
            logger.debug("Returning cached Notion data")
            return cached_data

        logger.debug(f"Using credentials: {credentials}")
        items = await get_items_notion(credentials)
        
        # Cache the results
        await cache.set_data("notion", json.loads(credentials), items)
        
        return items
    except Exception as e:
        logger.error("Error in load_notion_data:", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/disconnect/{integration_type}")
async def disconnect_integration(integration_type: str, request: Request):
    user_id = request.query_params.get('user_id')
    org_id = request.query_params.get('org_id')
    
    if not user_id or not org_id:
        raise HTTPException(status_code=400, detail="Missing user_id or org_id")
    
    try:
        logger.info(f"Starting disconnection process for {integration_type} (user: {user_id}, org: {org_id})")
        
        # Clear all related Redis keys
        keys_to_clear = [
            f"{integration_type.lower()}_credentials:{org_id}:{user_id}",
            f"{integration_type.lower()}_connection:{org_id}:{user_id}",
            f"{integration_type.lower()}_token:{org_id}:{user_id}",
            f"{integration_type.lower()}_refresh_token:{org_id}:{user_id}",
            f"{integration_type.lower()}_connection_time:{org_id}:{user_id}"
        ]
        
        for key in keys_to_clear:
            await delete_key_redis(key)
            logger.info(f"Removed Redis key: {key}")
        
        # Clear the cache for this integration
        dummy_credentials = {"user_id": user_id, "org_id": org_id}
        await cache.delete_data(integration_type.lower(), dummy_credentials)
        logger.info(f"Cleared cache for {integration_type}")
        
        logger.info(f"Successfully disconnected {integration_type}")
        return {"status": "success", "message": f"Disconnected {integration_type} successfully"}
    except Exception as e:
        logger.error(f"Error during disconnection: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 

@router.post("/{integration_type}/credentials")
async def get_integration_credentials(
    integration_type: str,
    user_id: str = Form(...),
    org_id: str = Form(...)
):
    logger.info(f"Getting {integration_type} credentials for user {user_id} in org {org_id}")
    
    try:
        # Get credentials based on integration type
        if integration_type.lower() == 'notion':
            credentials = await get_notion_credentials(user_id, org_id)
        elif integration_type.lower() == 'hubspot':
            credentials = await get_hubspot_credentials(user_id, org_id)
        elif integration_type.lower() == 'airtable':
            credentials = await get_airtable_credentials(user_id, org_id)
        else:
            raise HTTPException(status_code=400, detail="Invalid integration type")

        if credentials:
            # Store credentials in Redis
            credentials_key = f"{integration_type.lower()}_credentials:{org_id}:{user_id}"
            await add_key_value_redis(credentials_key, json.dumps(credentials))
            
            # Store connection info with timestamp
            connection_info = {
                "connected": True,
                "connected_at": datetime.utcnow().isoformat(),
                "user_id": user_id,
                "org_id": org_id
            }
            connection_key = f"{integration_type.lower()}_connection:{org_id}:{user_id}"
            await add_key_value_redis(connection_key, json.dumps(connection_info))
            
            logger.info(f"✅ Stored {integration_type} credentials and connection info")
            return credentials
        else:
            logger.error("❌ No credentials found")
            raise HTTPException(status_code=404, detail="No credentials found")
            
    except Exception as e:
        logger.error(f"❌ Error getting credentials: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/connection-info/{integration_type}")
async def get_connection_info(integration_type: str, user_id: str, org_id: str):
    logger.info(f"🔍 Checking connection info for {integration_type}")
    
    try:
        # Check for credentials
        credentials_key = f"{integration_type.lower()}_credentials:{org_id}:{user_id}"
        credentials_data = await get_value_redis(credentials_key)
        
        # Check for connection info
        connection_key = f"{integration_type.lower()}_connection:{org_id}:{user_id}"
        connection_data = await get_value_redis(connection_key)
        
        logger.info(f"Checking keys - Credentials: {credentials_key}, Connection: {connection_key}")
        
        if credentials_data:
            credentials = json.loads(credentials_data)
            connection = json.loads(connection_data) if connection_data else {
                "connected_at": datetime.utcnow().isoformat()
            }
            
            logger.info(f"✅ Found valid connection for {integration_type}")
            return {
                "integration": integration_type,
                "connected": True,
                "connected_at": connection.get("connected_at"),
                "credentials": credentials
            }
        
        logger.info(f"❌ No valid connection found for {integration_type}")
        return {
            "integration": integration_type,
            "connected": False
        }
            
    except Exception as e:
        logger.error(f"❌ Error checking connection: {str(e)}")
        return {
            "integration": integration_type,
            "connected": False
        } 