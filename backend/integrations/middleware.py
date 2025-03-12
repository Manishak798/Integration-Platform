import functools
import datetime
from fastapi import Request
from redis_client import add_key_value_redis, get_value_redis

def track_integration_connection(integration_name: str):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user_id and org_id from kwargs
            user_id = kwargs.get('user_id')
            org_id = kwargs.get('org_id')
            
            # Get the original response
            response = await func(*args, **kwargs)
            
            # If it's a credentials response, add connection time
            if isinstance(response, dict) and 'access_token' in response:
                connection_info = {
                    'integration': integration_name,
                    'connected_at': datetime.datetime.utcnow().isoformat(),
                    'expires_at': (
                        datetime.datetime.utcnow() + 
                        datetime.timedelta(seconds=response.get('expires_in', 21600))
                    ).isoformat()
                }
                
                # Store connection info
                await add_key_value_redis(
                    f'integration_connection:{integration_name}:{org_id}:{user_id}',
                    connection_info,
                    expire=response.get('expires_in', 21600)
                )
                
                # Add connection info to the response
                response.update(connection_info)
            
            return response
        return wrapper
    return decorator 