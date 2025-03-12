# notion.py

import json
import secrets
from fastapi import Request, HTTPException, APIRouter
from fastapi.responses import HTMLResponse
import httpx
import asyncio
import base64
import requests
from integrations.integration_item import IntegrationItem
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

from redis_client import add_key_value_redis, get_value_redis, delete_key_redis

load_dotenv()  # Load environment variables

router = APIRouter()

CLIENT_ID = os.getenv('NOTION_CLIENT_ID')
CLIENT_SECRET = os.getenv('NOTION_CLIENT_SECRET')
if not CLIENT_ID or not CLIENT_SECRET:
    raise ValueError("NOTION_CLIENT_ID and NOTION_CLIENT_SECRET must be set in environment variables")
encoded_client_id_secret = base64.b64encode(f'{CLIENT_ID}:{CLIENT_SECRET}'.encode()).decode()

REDIRECT_URI = 'http://localhost:8000/integrations/notion/oauth2callback'
authorization_url = f'https://api.notion.com/v1/oauth/authorize?client_id={CLIENT_ID}&response_type=code&owner=user&redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fintegrations%2Fnotion%2Foauth2callback'

async def authorize_notion(user_id, org_id):
    state_data = {
        'state': secrets.token_urlsafe(32),
        'user_id': user_id,
        'org_id': org_id
    }
    encoded_state = json.dumps(state_data)
    await add_key_value_redis(f'notion_state:{org_id}:{user_id}', encoded_state, expire=600)

    return f'{authorization_url}&state={encoded_state}'

async def oauth2callback_notion(request: Request):
    if request.query_params.get('error'):
        raise HTTPException(status_code=400, detail=request.query_params.get('error'))
    code = request.query_params.get('code')
    encoded_state = request.query_params.get('state')
    state_data = json.loads(encoded_state)

    original_state = state_data.get('state')
    user_id = state_data.get('user_id')
    org_id = state_data.get('org_id')

    saved_state = await get_value_redis(f'notion_state:{org_id}:{user_id}')

    if not saved_state or original_state != json.loads(saved_state).get('state'):
        raise HTTPException(status_code=400, detail='State does not match.')

    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://api.notion.com/v1/oauth/token',
            headers={
                'Authorization': f'Basic {encoded_client_id_secret}',
                'Content-Type': 'application/json'
            },
            json={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': REDIRECT_URI
            }
        )

    if response.status_code == 200:
        token_data = response.json()
        
        # Store pure UTC time without timezone info
        current_time = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        
        connection_info = {
            'integration': 'notion',
            'connected_at': current_time,
            'connected': True,
            'credentials': token_data
        }

        print(f"📝 Storing UTC time: {current_time}")
        print(f"🔑 For user: {user_id}, org: {org_id}")

        # Store both in Redis
        await add_key_value_redis(
            f'notion_credentials:{org_id}:{user_id}',
            json.dumps(token_data)
        )
        
        await add_key_value_redis(
            f'integration_connection:notion:{org_id}:{user_id}',
            json.dumps(connection_info)
        )

        close_window_script = """
        <html>
            <body>
                <script>
                    window.opener.postMessage('notion_connected', '*');
                    window.close();
                </script>
                <p>Connection successful! You can close this window.</p>
            </body>
        </html>
        """
        return HTMLResponse(content=close_window_script)
    else:
        error_script = """
        <html>
            <body>
                <script>
                    window.opener.postMessage('notion_error', '*');
                    window.close();
                </script>
                <p>Connection failed! You can close this window.</p>
            </body>
        </html>
        """
        return HTMLResponse(content=error_script)

async def get_notion_credentials(user_id, org_id):
    credentials = await get_value_redis(f'notion_credentials:{org_id}:{user_id}')
    if not credentials:
        raise HTTPException(status_code=400, detail='No credentials found.')
    credentials = json.loads(credentials)
    if not credentials:
        raise HTTPException(status_code=400, detail='No credentials found.')
    await delete_key_redis(f'notion_credentials:{org_id}:{user_id}')

    return credentials

def _recursive_dict_search(data, target_key):
    """Recursively search for a key in a dictionary of dictionaries."""
    if target_key in data:
        return data[target_key]

    for value in data.values():
        if isinstance(value, dict):
            result = _recursive_dict_search(value, target_key)
            if result is not None:
                return result
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    result = _recursive_dict_search(item, target_key)
                    if result is not None:
                        return result
    return None

def create_integration_item_metadata_object(
    response_json: str,
) -> IntegrationItem:
    """creates an integration metadata object from the response"""
    name = _recursive_dict_search(response_json['properties'], 'content')
    parent_type = (
        ''
        if response_json['parent']['type'] is None
        else response_json['parent']['type']
    )
    if response_json['parent']['type'] == 'workspace':
        parent_id = None
    else:
        parent_id = (
            response_json['parent'][parent_type]
        )

    name = _recursive_dict_search(response_json, 'content') if name is None else name
    name = 'multi_select' if name is None else name
    name = response_json['object'] + ' ' + name

    # Notion already provides ISO format strings for dates, so we don't need to parse them
    integration_item_metadata = IntegrationItem(
        id=response_json['id'],
        type=response_json['object'],
        name=name,
        creation_time=response_json['created_time'],  # Already in ISO format
        last_modified_time=response_json['last_edited_time'],  # Already in ISO format
        parent_id=parent_id,
    )

    return integration_item_metadata

async def get_items_notion(credentials) -> list[IntegrationItem]:
    """Aggregates all metadata relevant for a notion integration"""
    credentials = json.loads(credentials)
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://api.notion.com/v1/search',
            headers={
                'Authorization': f'Bearer {credentials.get("access_token")}',
                'Notion-Version': '2022-06-28',
            },
        )

    list_of_integration_item_metadata = []
    if response.status_code == 200:
        results = response.json()['results']
        for result in results:
            list_of_integration_item_metadata.append(
                create_integration_item_metadata_object(result)
            )
        print('--------------------------------')
        print(list_of_integration_item_metadata)
    
    return list_of_integration_item_metadata

@router.post("/disconnect/notion")
async def disconnect_notion(request: Request):
    user_id = request.query_params.get('user_id')
    org_id = request.query_params.get('org_id')
    
    if not user_id or not org_id:
        raise HTTPException(status_code=400, detail="Missing user_id or org_id")
    
    try:
        # Remove credentials from Redis
        await delete_key_redis(f'notion_credentials:{org_id}:{user_id}')
        await delete_key_redis(f'notion_connection:{org_id}:{user_id}')
        
        return {"status": "success", "message": "Disconnected successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
