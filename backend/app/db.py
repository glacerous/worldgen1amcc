import threading
from supabase import create_client, Client
from app.config import settings

class ThreadLocalSupabaseProxy:
    def __init__(self):
        # Use object.__setattr__ to avoid recursion since we override __setattr__
        object.__setattr__(self, "_local", threading.local())

    def _get_client(self) -> Client:
        if not hasattr(self._local, "client"):
            self._local.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        return self._local.client

    def __getattr__(self, name):
        return getattr(self._get_client(), name)

    def __setattr__(self, name, value):
        setattr(self._get_client(), name, value)

    def __repr__(self):
        return repr(self._get_client())

    def __str__(self):
        return str(self._get_client())

# Initialize Supabase client proxy
supabase: Client = ThreadLocalSupabaseProxy()  # type: ignore

