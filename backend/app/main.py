from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import asyncio
from datetime import datetime
import os
from dotenv import load_dotenv
import logging
from sqlalchemy.orm import Session
from .exchange import Exchange
from .database import get_db, save_grid_state, get_active_grid, stop_active_grid
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
grid_update_task = None
price_update_task = None
balance_update_task = None

class GridParams(BaseModel):
    symbol: str = DEFAULT_GRID_CONFIG["symbol"]
    positions: int = DEFAULT_GRID_CONFIG["positions"]
    total_amount: float = DEFAULT_GRID_CONFIG["total_amount"]
    min_distance: float = DEFAULT_GRID_CONFIG["min_distance"]
    max_distance: float = DEFAULT_GRID_CONFIG["max_distance"]

async def update_market_price():
    """Background task to update market price every minute"""
    db = next(get_db())
    while True:
        try:
            grid_state = get_active_grid(db)
            if grid_state:
                # Get current market price
                current_price = await exchange.get_market_price(grid_state.symbol)
                logger.info(f"Updated market price: {current_price}")
                
                # Update state with new price
                save_grid_state(db, GridParams(
                    symbol=grid_state.symbol,
                    positions=grid_state.positions,
                    total_amount=grid_state.total_amount,
                    min_distance=grid_state.min_distance,
                    max_distance=grid_state.max_distance
                ), current_price, grid_state.open_orders, grid_state.balance)
        except Exception as e:
            logger.error(f"Error updating market price: {str(e)}")
        
        # Wait for 1 minute before next update
        await asyncio.sleep(60)  # 1 minute in seconds

async def update_balance():
    """Background task to update balance every 5 minutes"""
    db = next(get_db())
    while True:
        try:
            grid_state = get_active_grid(db)
            if grid_state:
                # Get current balance
                balance = await exchange.get_balance("usdt")
                logger.info(f"Updated balance: {balance}")
                
                # Update state with new balance
                save_grid_state(db, GridParams(
                    symbol=grid_state.symbol,
                    positions=grid_state.positions,
                    total_amount=grid_state.total_amount,
                    min_distance=grid_state.min_distance,
                    max_distance=grid_state.max_distance
                ), grid_state.current_price, grid_state.open_orders, balance)
        except Exception as e:
            logger.error(f"Error updating balance: {str(e)}")
        
        # Wait for 5 minutes before next update
        await asyncio.sleep(300)  # 5 minutes in seconds

async def update_grid_orders():
    """Background task to update grid orders every 30 minutes"""
    db = next(get_db())
    while True:
        try:
            grid_state = get_active_grid(db)
            if grid_state:
                logger.info("Updating grid orders...")
                current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                logger.info(f"Current time: {current_time}")
                
                # Get current market price
                current_price = await exchange.get_market_price(grid_state.symbol)
                logger.info(f"Current price: {current_price}")
                
                # Get balance and open orders
                balance = await exchange.get_balance("usdt")
                open_orders = await exchange.get_open_orders(grid_state.symbol)
                
                # Update state in database
                save_grid_state(db, GridParams(
                    symbol=grid_state.symbol,
                    positions=grid_state.positions,
                    total_amount=grid_state.total_amount,
                    min_distance=grid_state.min_distance,
                    max_distance=grid_state.max_distance
                ), current_price, open_orders, balance)
                
                # Cancel existing orders
                await exchange.cancel_all_orders(grid_state.symbol)
                logger.info("Cancelled existing orders")
                
                # Calculate grid parameters
                amount_per_grid = grid_state.total_amount / grid_state.positions
                price_step = (grid_state.max_distance - grid_state.min_distance) / (grid_state.positions - 1)
                
                # Place new grid orders around current price
                for i in range(grid_state.positions):
                    try:
                        distance = grid_state.min_distance + (price_step * i)
                        
                        # Calculate buy and sell prices based on current market price
                        buy_price = current_price * (1 - distance / 100)
                        sell_price = current_price * (1 + distance / 100)
                        
                        # Place buy order
                        await exchange.place_grid_orders(
                            symbol=grid_state.symbol,
                            price=buy_price,
                            quantity=amount_per_grid / buy_price,
                            side='BUY'
                        )
                        
                        # Place sell order
                        await exchange.place_grid_orders(
                            symbol=grid_state.symbol,
                            price=sell_price,
                            quantity=amount_per_grid / sell_price,
                            side='SELL'
                        )
                        
                    except Exception as e:
                        logger.error(f"Error placing grid orders at level {i}: {str(e)}")
                
                logger.info("Successfully updated grid orders")
                
                # Update final state
                final_orders = await exchange.get_open_orders(grid_state.symbol)
                save_grid_state(db, GridParams(
                    symbol=grid_state.symbol,
                    positions=grid_state.positions,
                    total_amount=grid_state.total_amount,
                    min_distance=grid_state.min_distance,
                    max_distance=grid_state.max_distance
                ), current_price, final_orders, balance)
            
        except Exception as e:
            logger.error(f"Error in grid update task: {str(e)}")
        
        # Wait for 10 minutes before next update
        await asyncio.sleep(10 * 60)  #  10 minutes in seconds

@app.post("/api/grid/create")
async def create_grid(grid_params: GridParams, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create a new grid"""
    global grid_update_task, price_update_task, balance_update_task
    try:
        logger.info(f"Creating grid with params: {grid_params}")
        
        # Cancel any existing orders
        await exchange.cancel_all_orders(grid_params.symbol)
        
        # Get current market price and state
        current_price = await exchange.get_market_price(grid_params.symbol)
        balance = await exchange.get_balance("usdt")
        open_orders = await exchange.get_open_orders(grid_params.symbol)
        
        # Save initial state
        grid_state = save_grid_state(db, grid_params, current_price, open_orders, balance)
        
        # Start the background tasks if not already running
        if grid_update_task is None:
            logger.info("Starting grid update task")
            background_tasks.add_task(update_grid_orders)
            grid_update_task = True
            
        if price_update_task is None:
            logger.info("Starting price update task")
            background_tasks.add_task(update_market_price)
            price_update_task = True
            
        if balance_update_task is None:
            logger.info("Starting balance update task")
            background_tasks.add_task(update_balance)
            balance_update_task = True
        
        return {
            "status": "running",
            "grid_state": {
                "status": "running",
                "params": grid_params,
                "current_price": current_price,
                "open_orders": open_orders,
                "balance": balance,
                "last_update": datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Error creating grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/grid/stop")
async def stop_grid(db: Session = Depends(get_db)):
    """Stop the grid bot"""
    global grid_update_task, price_update_task, balance_update_task
    try:
        grid_state = get_active_grid(db)
        if grid_state:
            # Cancel all open orders
            await exchange.cancel_all_orders(grid_state.symbol)
            # Update database
            stop_active_grid(db)
            grid_update_task = None
            price_update_task = None
            balance_update_task = None
            return {"status": "success", "message": "Grid stopped successfully"}
        else:
            return {"status": "error", "message": "No active grid found"}
    except Exception as e:
        logger.error(f"Error stopping grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/grid/status")
async def get_grid_status(db: Session = Depends(get_db)):
    """Get current grid status"""
    try:
        grid_state = get_active_grid(db)
        if grid_state:
            # Get latest price and orders
            current_price = await exchange.get_market_price(grid_state.symbol)
            balance = await exchange.get_balance("usdt")
            open_orders = await exchange.get_open_orders(grid_state.symbol)
            
            # Update state
            updated_state = save_grid_state(db, GridParams(
                symbol=grid_state.symbol,
                positions=grid_state.positions,
                total_amount=grid_state.total_amount,
                min_distance=grid_state.min_distance,
                max_distance=grid_state.max_distance
            ), current_price, open_orders, balance)
            
            return {
                "status": "running",
                "grid_state": {
                    "status": "running",
                    "params": {
                        "symbol": updated_state.symbol,
                        "positions": updated_state.positions,
                        "total_amount": updated_state.total_amount,
                        "min_distance": updated_state.min_distance,
                        "max_distance": updated_state.max_distance
                    },
                    "current_price": current_price,
                    "open_orders": open_orders,
                    "balance": balance,
                    "last_update": updated_state.last_update.isoformat()
                }
            }
        else:
            return {
                "status": "stopped",
                "grid_state": None
            }
    except Exception as e:
        logger.error(f"Error getting grid status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
