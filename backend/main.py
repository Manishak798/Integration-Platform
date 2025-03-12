from fastapi import FastAPI, Form, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import redis.exceptions
from redis_client import redis_client, add_key_value_redis, get_value_redis
from routes import integrations  # Import the router
from integrations.middleware import track_integration_connection
import json
import datetime
import logging
import sys

from integrations.airtable import authorize_airtable, get_items_airtable, oauth2callback_airtable, get_airtable_credentials
from integrations.notion import authorize_notion, get_items_notion, oauth2callback_notion, get_notion_credentials
from integrations.hubspot import authorize_hubspot, get_hubspot_credentials, oauth2callback_hubspot

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Log to stdout
    ]
)

logger = logging.getLogger(__name__)

app = FastAPI()

origins = [
    "http://localhost:3000",  # React app address
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Check Redis connection on startup"""
    try:
        await redis_client.ping()
    except redis.exceptions.ConnectionError:
        print("WARNING: Could not connect to Redis. Caching will be disabled.")
    logger.info("Application startup")

# Include the integrations router
app.include_router(
    integrations.router,
    prefix="/integrations",
    tags=["integrations"]
)

@app.get('/')
def read_root():
    return {'Ping': 'Pong'}


# Airtable
@app.post('/integrations/airtable/authorize')
async def authorize_airtable_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await authorize_airtable(user_id, org_id)

@app.get('/integrations/airtable/oauth2callback')
async def oauth2callback_airtable_integration(request: Request):
    return await oauth2callback_airtable(request)

@app.post('/integrations/airtable/credentials')
async def get_airtable_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await get_airtable_credentials(user_id, org_id)

@app.post('/integrations/airtable/load')
async def get_airtable_items(credentials: str = Form(...)):
    return await get_items_airtable(credentials)


# Notion
@app.post('/integrations/notion/authorize')
@track_integration_connection('notion')
async def authorize_notion_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await authorize_notion(user_id, org_id)

@app.get('/integrations/notion/oauth2callback')
async def oauth2callback_notion_integration(request: Request):
    return await oauth2callback_notion(request)

@app.post('/integrations/notion/credentials')
async def get_notion_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await get_notion_credentials(user_id, org_id)

# HubSpot
@app.post('/integrations/hubspot/authorize')
@track_integration_connection('hubspot')
async def hubspot_authorize(user_id: str = Form(...), org_id: str = Form(...)):
    return await authorize_hubspot(user_id, org_id)

@app.get('/integrations/hubspot/oauth2callback')
async def hubspot_callback(request: Request):
    return await oauth2callback_hubspot(request)

@app.post('/integrations/hubspot/credentials')
async def get_hubspot_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await get_hubspot_credentials(user_id, org_id)

# Add a general endpoint to get connection info for any integration
@app.get('/integrations/connection-info/{integration_name}')
async def get_integration_connection_info(
    integration_name: str,
    user_id: str = Query(...),
    org_id: str = Query(...)
):
    try:
        print(f"🔍 Checking connection info for {integration_name}")
        print(f"👤 User: {user_id}, Org: {org_id}")
        
        # Check for credentials
        credentials_key = f'{integration_name}_credentials:{org_id}:{user_id}'
        credentials = await get_value_redis(credentials_key)
        print(f"💾 Credentials found: {bool(credentials)}")
        
        # Check for connection info
        connection_key = f'integration_connection:{integration_name}:{org_id}:{user_id}'
        connection_info = await get_value_redis(connection_key)
        print(f"🔌 Connection info found: {bool(connection_info)}")
        
        if connection_info:
            info = json.loads(connection_info)
            print(f"ℹ️ Returning connection info: {info}")
            return info
            
        if credentials:
            # If we have credentials but no connection info, create it
            credentials_data = json.loads(credentials)
            connection_info = {
                'integration': integration_name,
                'connected_at': datetime.datetime.utcnow().isoformat(),
                'connected': True,
                'credentials': credentials_data
            }
            
            print(f"🆕 Creating new connection info: {connection_info}")
            
            await add_key_value_redis(
                connection_key,
                json.dumps(connection_info)
            )
            
            return connection_info

        print("❌ No connection found")
        return {"connected": False}
        
    except Exception as e:
        print(f"❌ Error getting connection info: {str(e)}")
        return {"connected": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
