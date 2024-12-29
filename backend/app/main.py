from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import asyncio
from datetime import datetime
import os
from dotenv import load_dotenv
import logging
from .exchange import Exchange
from .config import DEFAULT_GRID_CONFIG

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize exchange
exchange = Exchange(
    api_key=os.getenv('EXCHANGE_API_KEY'),
    secret_key=os.getenv('EXCHANGE_SECRET_KEY')
)

# Store active grid parameters
active_grid = None
grid_update_task = None

class GridParams(BaseModel):
    symbol: str = DEFAULT_GRID_CONFIG["symbol"]
    positions: int = DEFAULT_GRID_CONFIG["positions"]
    total_amount: float = DEFAULT_GRID_CONFIG["total_amount"]
    min_distance: float = DEFAULT_GRID_CONFIG["min_distance"]
    max_distance: float = DEFAULT_GRID_CONFIG["max_distance"]

async def update_grid_orders():
    """Background task to update grid orders every 30 minutes"""
    global active_grid
    while True:
        try:
            if active_grid:
                logger.info("Updating grid orders...")
                current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                logger.info(f"Current time: {current_time}")
                
                # Get current market price
                current_price = await exchange.get_market_price(active_grid.symbol)
                logger.info(f"Current price: {current_price}")
                
                # Cancel existing orders
                await exchange.cancel_all_orders(active_grid.symbol)
                logger.info("Cancelled existing orders")
                
                # Calculate grid parameters
                amount_per_grid = active_grid.total_amount / active_grid.positions
                price_step = (active_grid.max_distance - active_grid.min_distance) / (active_grid.positions - 1)
                
                # Place new grid orders around current price
                for i in range(active_grid.positions):
                    try:
                        distance = active_grid.min_distance + (price_step * i)
                        
                        # Calculate buy and sell prices based on current market price
                        buy_price = current_price * (1 - distance / 100)
                        sell_price = current_price * (1 + distance / 100)
                        
                        # Place buy order
                        await exchange.place_grid_orders(
                            symbol=active_grid.symbol,
                            price=buy_price,
                            quantity=amount_per_grid / buy_price,
                            side='BUY'
                        )
                        
                        # Place sell order
                        await exchange.place_grid_orders(
                            symbol=active_grid.symbol,
                            price=sell_price,
                            quantity=amount_per_grid / sell_price,
                            side='SELL'
                        )
                        
                    except Exception as e:
                        logger.error(f"Error placing grid orders at level {i}: {str(e)}")
                
                logger.info("Successfully updated grid orders")
            
        except Exception as e:
            logger.error(f"Error in grid update task: {str(e)}")
        
        # Wait for 30 minutes before next update
        await asyncio.sleep(30 * 60)  # 30 minutes in seconds

@app.get("/")
async def root():
    return {"status": "ok", "message": "Grid Trading Bot API is running"}

@app.get("/api/balance/{currency}")
async def get_balance(currency: str = "usdt"):
    """Get balance for a specific currency"""
    logger.info(f"Getting balance for {currency}")
    try:
        balance = await exchange.get_balance(currency)
        logger.info(f"Balance response: {balance}")
        if not balance:
            raise HTTPException(status_code=400, detail="Failed to fetch balance")
        return balance
    except Exception as e:
        logger.error(f"Error getting balance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market-info/{symbol}")
async def get_market_info(symbol: str = "aipg_usdt"):
    """Get market information for a symbol"""
    logger.info(f"Getting market info for {symbol}")
    try:
        market_info = await exchange.get_market_info(symbol)
        logger.info(f"Market info response: {market_info}")
        if not market_info:
            raise HTTPException(status_code=400, detail=f"Failed to fetch market info for {symbol}")
        return market_info
    except Exception as e:
        logger.error(f"Error getting market info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market-price/{symbol}")
async def get_market_price(symbol: str = "aipg_usdt"):
    """Get current market price for a symbol"""
    logger.info(f"Getting market price for {symbol}")
    try:
        # First check if the market exists
        market_info = await exchange.get_market_info(symbol)
        if not market_info:
            raise HTTPException(status_code=400, detail=f"Market {symbol} not found")
            
        price = await exchange.get_market_price(symbol)
        logger.info(f"Price response: {price}")
        if not price:
            raise HTTPException(status_code=400, detail=f"Failed to fetch price for {symbol}")
        return {"price": price, "market_info": market_info}
    except Exception as e:
        logger.error(f"Error getting market price: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/orders/{symbol}")
async def get_open_orders(symbol: str = "aipg_usdt"):
    """Get all open orders for a symbol"""
    logger.info(f"Getting open orders for {symbol}")
    try:
        orders = await exchange.get_open_orders(symbol)
        logger.info(f"Orders response: {orders}")
        if orders is None:
            raise HTTPException(status_code=400, detail="Failed to fetch open orders")
        return orders if isinstance(orders, list) else []
    except Exception as e:
        logger.error(f"Error getting open orders: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/grid/create")
async def create_grid(grid_params: GridParams, background_tasks: BackgroundTasks):
    """Create a new grid"""
    global active_grid, grid_update_task
    try:
        logger.info(f"Creating grid with params: {grid_params}")
        
        # Store grid parameters
        active_grid = grid_params
        
        # Cancel any existing orders
        await exchange.cancel_all_orders(grid_params.symbol)
        
        # Start the grid update task if not already running
        if grid_update_task is None:
            logger.info("Starting grid update task")
            background_tasks.add_task(update_grid_orders)
            grid_update_task = True
        
        # Create initial grid
        current_price = await exchange.get_market_price(grid_params.symbol)
        logger.info(f"Current price: {current_price}")
        
        amount_per_grid = grid_params.total_amount / grid_params.positions
        price_step = (grid_params.max_distance - grid_params.min_distance) / (grid_params.positions - 1)
        
        for i in range(grid_params.positions):
            try:
                distance = grid_params.min_distance + (price_step * i)
                
                # Calculate buy and sell prices
                buy_price = current_price * (1 - distance / 100)
                sell_price = current_price * (1 + distance / 100)
                
                # Place buy order
                await exchange.place_grid_orders(
                    symbol=grid_params.symbol,
                    price=buy_price,
                    quantity=amount_per_grid / buy_price,
                    side='BUY'
                )
                
                # Place sell order
                await exchange.place_grid_orders(
                    symbol=grid_params.symbol,
                    price=sell_price,
                    quantity=amount_per_grid / sell_price,
                    side='SELL'
                )
                
            except Exception as e:
                logger.error(f"Error placing grid orders at level {i}: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to place grid orders: {str(e)}")
        
        return {"status": "success", "message": "Grid created successfully"}
        
    except Exception as e:
        logger.error(f"Error creating grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/grid/stop")
async def stop_grid():
    """Stop the grid bot"""
    global active_grid, grid_update_task
    try:
        if active_grid:
            # Cancel all open orders
            await exchange.cancel_all_orders(active_grid.symbol)
            active_grid = None
            grid_update_task = None
            return {"status": "success", "message": "Grid stopped successfully"}
        else:
            return {"status": "error", "message": "No active grid found"}
    except Exception as e:
        logger.error(f"Error stopping grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/grid/status")
async def get_grid_status():
    """Get current grid status"""
    try:
        if active_grid:
            return {
                "status": "running",
                "params": active_grid,
                "last_update": datetime.now().isoformat()
            }
        else:
            return {
                "status": "stopped",
                "params": None
            }
    except Exception as e:
        logger.error(f"Error getting grid status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/grid/{symbol}")
async def cancel_grid(symbol: str = "aipg_usdt"):
    """Cancel all orders in the grid"""
    logger.info(f"Canceling grid for {symbol}")
    try:
        success = await exchange.cancel_all_orders(symbol)
        logger.info(f"Grid cancellation response: {success}")
        if not success:
            raise HTTPException(status_code=400, detail="Failed to cancel grid")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error canceling grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
