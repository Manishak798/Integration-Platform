import json
import secrets
from fastapi import Request, HTTPException, APIRouter
from fastapi.responses import HTMLResponse
import httpx
import asyncio
import base64
from integrations.integration_item import IntegrationItem
from datetime import datetime, timezone
import aiohttp
import os
from dotenv import load_dotenv

from redis_client import add_key_value_redis, get_value_redis, delete_key_redis

router = APIRouter()  # Add router

load_dotenv()  # Load environment variables

CLIENT_ID = os.getenv('HUBSPOT_CLIENT_ID')
CLIENT_SECRET = os.getenv('HUBSPOT_CLIENT_SECRET')
if not CLIENT_ID or not CLIENT_SECRET:
    raise ValueError("HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be set in environment variables")

encoded_client_id_secret = base64.b64encode(f'{CLIENT_ID}:{CLIENT_SECRET}'.encode()).decode()
REDIRECT_URI = 'http://localhost:8000/integrations/hubspot/oauth2callback'

AUTHORIZATION_URL = (
    'https://app-na2.hubspot.com/oauth/authorize'  # Updated to match your HubSpot portal
    f'?client_id={CLIENT_ID}'
    f'&redirect_uri={REDIRECT_URI}'
    '&scope=oauth'  # Updated to match your HubSpot app configuration
)


print(f"Check - AUTHORIZATION_URL: {AUTHORIZATION_URL}")
# Add router endpoints
@router.post("/disconnect/hubspot")
async def disconnect_hubspot(request: Request):
    user_id = request.query_params.get('user_id')
    org_id = request.query_params.get('org_id')
    
    if not user_id or not org_id:
        raise HTTPException(status_code=400, detail="Missing user_id or org_id")
    
    try:
        # Remove credentials and connection info from Redis
        await delete_key_redis(f'hubspot_credentials:{org_id}:{user_id}')
        await delete_key_redis(f'hubspot_connection:{org_id}:{user_id}')
        
        print(f"✅ Successfully disconnected Hubspot for user {user_id} in org {org_id}")
        return {"status": "success", "message": "Disconnected successfully"}
    except Exception as e:
        print(f"❌ Error disconnecting Hubspot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def authorize_hubspot(user_id, org_id):
    state_data = {
        'state': secrets.token_urlsafe(32),
        'user_id': user_id,
        'org_id': org_id
    }
    encoded_state = json.dumps(state_data)
    await add_key_value_redis(f'hubspot_state:{org_id}:{user_id}', encoded_state, expire=600)
    
    auth_url = f'{AUTHORIZATION_URL}&state={encoded_state}'
    print(f"🔄 HubSpot OAuth: Redirecting to {auth_url}")
    return auth_url

async def oauth2callback_hubspot(request: Request):
    if request.query_params.get('error'):
        print(f"❌ HubSpot OAuth Error: {request.query_params.get('error')}")
        raise HTTPException(status_code=400, detail=request.query_params.get('error'))
    
    code = request.query_params.get('code')
    encoded_state = request.query_params.get('state')
    state_data = json.loads(encoded_state)

    original_state = state_data.get('state')
    user_id = state_data.get('user_id')
    org_id = state_data.get('org_id')

    print(f"✅ HubSpot OAuth: Received code for user {user_id}, org {org_id}")

    saved_state = await get_value_redis(f'hubspot_state:{org_id}:{user_id}')

    if not saved_state or original_state != json.loads(saved_state).get('state'):
        print("❌ HubSpot OAuth: State mismatch error")
        raise HTTPException(status_code=400, detail='State does not match.')

    async with httpx.AsyncClient() as client:
        response, _ = await asyncio.gather(
            client.post(
                'https://api.hubapi.com/oauth/v1/token',
                data={
                    'grant_type': 'authorization_code',
                    'code': code,
                    'redirect_uri': REDIRECT_URI,
                    'client_id': CLIENT_ID,
                    'client_secret': CLIENT_SECRET
                }
            ),
            delete_key_redis(f'hubspot_state:{org_id}:{user_id}'),
        )

    if response.status_code == 200:
        print("✅ HubSpot OAuth: Successfully obtained access token")
        token_data = response.json()
        
        # Get current time in ISO format
        current_time = datetime.now(timezone.utc).isoformat()
        
        connection_info = {
            'integration': 'hubspot',
            'connected_at': current_time,
            'connected': True,
            'credentials': token_data
        }

        # Store both credentials and connection info
        await add_key_value_redis(
            f'hubspot_credentials:{org_id}:{user_id}',
            json.dumps(token_data)
        )
        
        await add_key_value_redis(
            f'integration_connection:hubspot:{org_id}:{user_id}',
            json.dumps(connection_info)
        )

        close_window_script = """
        <html>
            <body>
                <script>
                    window.opener.postMessage('hubspot_connected', '*');
                    window.close();
                </script>
                <p>Connection successful! You can close this window.</p>
            </body>
        </html>
        """
        return HTMLResponse(content=close_window_script)
    else:
        print(f"❌ HubSpot OAuth: Token exchange failed with status {response.status_code}")
        print(f"Response: {response.text}")
        
        error_script = """
        <html>
            <body>
                <script>
                    window.opener.postMessage('hubspot_error', '*');
                    window.close();
                </script>
                <p>Connection failed! You can close this window.</p>
            </body>
        </html>
        """
        return HTMLResponse(content=error_script)

async def get_hubspot_credentials(user_id, org_id):
    credentials = await get_value_redis(f'hubspot_credentials:{org_id}:{user_id}')
    if not credentials:
        raise HTTPException(status_code=400, detail='No credentials found.')
    credentials = json.loads(credentials)
    if not credentials:
        raise HTTPException(status_code=400, detail='No credentials found.')
    await delete_key_redis(f'hubspot_credentials:{org_id}:{user_id}')

    return credentials

async def get_items_hubspot(credentials: str, api_type: str):
    """Get items from HubSpot based on API type"""
    try:
        creds = json.loads(credentials)
        access_token = creds.get('access_token')
        
        if not access_token:
            raise ValueError("Access token is required")

        base_url = "https://api.hubapi.com"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        # Map API types to their endpoints and properties
        api_config = {
            "contacts": {
                "endpoint": "/crm/v3/objects/contacts",
                "properties": ["firstname", "lastname", "email", "phone"]
            },
            "companies": {
                "endpoint": "/crm/v3/objects/companies",
                "properties": ["name", "domain", "industry"]
            },
            "deals": {
                "endpoint": "/crm/v3/objects/deals",
                "properties": ["dealname", "amount", "dealstage"]
            },
            "tickets": {
                "endpoint": "/crm/v3/objects/tickets",
                "properties": ["subject", "content", "status"]
            }
        }

        if api_type not in api_config:
            raise ValueError(f"Invalid API type: {api_type}")

        config = api_config[api_type]
        params = {
            'limit': 100,
            'properties': config['properties']
        }

        print(f"🔄 Fetching HubSpot {api_type} with params: {params}")

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{base_url}{config['endpoint']}", 
                headers=headers,
                params=params
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"❌ HubSpot API error: {error_text}")
                    raise HTTPException(
                        status_code=response.status,
                        detail=f"HubSpot API error: {error_text}"
                    )
                
                data = await response.json()
                
                if not data or 'results' not in data:
                    print(f"⚠️ Unexpected HubSpot response format: {data}")
                    raise HTTPException(
                        status_code=500,
                        detail="Invalid response format from HubSpot"
                    )

                print(f"✅ Successfully fetched {len(data['results'])} {api_type} from HubSpot")
                return {
                    'items': data['results'],
                    'total': data.get('total', len(data['results'])),
                    'type': api_type
                }

    except json.JSONDecodeError as e:
        print(f"❌ Invalid credentials format: {str(e)}")
        raise ValueError(f"Invalid credentials format: {str(e)}")
    except Exception as e:
        print(f"❌ Error in get_items_hubspot: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch {api_type} from HubSpot: {str(e)}"
        )

async def get_hubspot_contacts(org_id: str, user_id: str):
    try:
        # Get credentials from Redis
        credentials = await get_value_redis(f'hubspot_credentials:{org_id}:{user_id}')
        if not credentials:
            print("❌ No HubSpot credentials found")
            raise HTTPException(status_code=401, detail="No HubSpot credentials found")
        
        credentials = json.loads(credentials)
        access_token = credentials.get('access_token')

        # Call HubSpot API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                'https://api.hubapi.com/crm/v3/objects/contacts',
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json'
                },
                params={
                    'limit': 100,  # Adjust as needed
                    'properties': ['firstname', 'lastname', 'email', 'phone']  # Add/remove properties as needed
                }
            )
            
            if response.status_code == 200:
                print("✅ Successfully fetched HubSpot contacts")
                return response.json()
            else:
                print(f"❌ Failed to fetch HubSpot contacts: {response.status_code}")
                print(f"Response: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch HubSpot contacts")

    except Exception as e:
        print(f"❌ Error fetching HubSpot contacts: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
