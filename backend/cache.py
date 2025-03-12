from redis import Redis
import json
from datetime import timedelta
from typing import Dict, Any, Optional
from redis_client import add_key_value_redis, get_value_redis, delete_key_redis
from integrations.integration_item import IntegrationItem  # Update this import path

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, IntegrationItem):
            try:
                return obj.to_dict()
            except Exception as e:
                print(f"Error converting IntegrationItem to dict: {str(e)}")
                print(f"Object: {obj}")
                raise
        return super().default(obj)

class Cache:
    def __init__(self):
        self.default_expiration = int(timedelta(hours=1).total_seconds())

    def _generate_key(self, integration_type: str, credentials: Dict[str, Any]) -> str:
        """Generate a unique cache key based on integration type and credentials"""
        # Sort credentials to ensure consistent key generation
        cred_str = json.dumps(credentials, sort_keys=True)
        return f"integration:{integration_type}:{cred_str}"

    async def get_data(self, integration_type: str, credentials: Dict[str, Any]) -> Optional[Dict]:
        """
        Retrieve data from cache
        Returns None if key doesn't exist
        """
        try:
            key = self._generate_key(integration_type, credentials)
            data = await get_value_redis(key)
            return json.loads(data) if data else None
        except Exception as e:
            print(f"Cache get error: {str(e)}")
            return None

    async def set_data(self, integration_type: str, credentials: Dict[str, Any], data: Any) -> bool:
        """
        Store data in cache with expiration
        Returns True if successful, False otherwise
        """
        try:
            key = self._generate_key(integration_type, credentials)
            # Add debug logging
            print(f"Attempting to serialize data: {data}")
            json_data = json.dumps(data, cls=CustomJSONEncoder)
            await add_key_value_redis(
                key=key,
                value=json_data,
                expire=self.default_expiration
            )
            return True
        except Exception as e:
            print(f"Cache set error: {str(e)}")
            print(f"Data type: {type(data)}")
            if isinstance(data, (list, tuple)):
                print(f"First item type: {type(data[0]) if data else None}")
            return False

    async def delete_data(self, integration_type: str, credentials: Dict[str, Any]) -> bool:
        """
        Delete data from cache
        Returns True if successful, False otherwise
        """
        try:
            key = self._generate_key(integration_type, credentials)
            await delete_key_redis(key)
            return True
        except Exception as e:
            print(f"Cache delete error: {str(e)}")
            return False

# Create a global cache instance
cache = Cache()

__all__ = ['cache'] 