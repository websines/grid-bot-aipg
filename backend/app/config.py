import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv('EXCHANGE_API_KEY')
SECRET_KEY = os.getenv('EXCHANGE_SECRET_KEY')
HOST = "https://sapi.xt.com"

# Grid Trading Configuration
DEFAULT_GRID_CONFIG = {
    "symbol": "AIPG_USDT",
    "positions": 20,
    "total_amount": 200,
    "min_distance": 0.5,
    "max_distance": 10
}
