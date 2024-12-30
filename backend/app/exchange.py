from pyxt.spot import Spot
import logging

logger = logging.getLogger(__name__)

class Exchange:
    def __init__(self, api_key: str, secret_key: str):
        self.client = Spot(
            host="https://sapi.xt.com",
            access_key=api_key,
            secret_key=secret_key
        )

    async def get_balance(self, asset: str = "usdt"):
        """Get balance for an asset"""
        try:
            logger.info(f"Getting balance for {asset}")
            balance = self.client.balance(asset.lower())
            logger.info(f"Balance response: {balance}")
            return balance
        except Exception as e:
            logger.error(f"Error getting balance: {str(e)}")
            return None

    async def get_market_info(self, symbol: str = "aipg_usdt"):
        """Get market information including price precision"""
        try:
            logger.info(f"Fetching market info for {symbol}")
            # Get symbol config
            try:
                symbol_config = self.client.get_symbol_config(symbol=symbol.lower())
                logger.info(f"Symbol config response: {symbol_config}")
                if symbol_config:
                    # Also get current price
                    try:
                        price = await self.get_market_price(symbol)
                    except Exception as e:
                        logger.error(f"Error getting price for market info: {str(e)}")
                        price = None

                    return {
                        "symbol": symbol.lower(),
                        "status": "trading",
                        "config": symbol_config,
                        "currentPrice": price
                    }
            except Exception as e:
                logger.error(f"Error getting symbol config: {str(e)}")

            # Try to get ticker data
            try:
                logger.info("Getting ticker data")
                ticker = self.client.get_tickers(symbol=symbol.lower())
                logger.info(f"Ticker response: {ticker}")
                if isinstance(ticker, list) and len(ticker) > 0:
                    ticker_data = next((t for t in ticker if t.get('s') == symbol.lower()), None)
                    if ticker_data:
                        return {
                            "symbol": symbol.lower(),
                            "status": "trading",
                            "currentPrice": float(ticker_data['p']) if 'p' in ticker_data else None,
                            "timestamp": ticker_data.get('t')
                        }

            except Exception as e:
                logger.error(f"Error getting ticker: {str(e)}")

            raise Exception("Could not get market info from any endpoint")
        except Exception as e:
            logger.error(f"Error getting market info: {str(e)}")
            raise Exception(f"Failed to get market info: {str(e)}")

    async def get_market_price(self, symbol: str = "aipg_usdt"):
        """Get current market price for a symbol"""
        try:
            logger.info(f"Fetching market price for {symbol}")
            # Get ticker data
            ticker = self.client.get_tickers(symbol=symbol.lower())
            logger.info(f"Ticker response: {ticker}")
            
            if not ticker:
                raise Exception("No ticker data received")

            # The response is a list of ticker objects with 's' (symbol), 't' (timestamp), 'p' (price)
            if isinstance(ticker, list) and len(ticker) > 0:
                for t in ticker:
                    if t.get('s') == symbol.lower() and 'p' in t:
                        try:
                            price = float(t['p'])
                            logger.info(f"Found price: {price}")
                            return price
                        except (ValueError, TypeError) as e:
                            logger.error(f"Error converting price to float: {e}")
                            continue
                
                raise Exception(f"No valid price found for symbol {symbol}")
            else:
                raise Exception(f"Unexpected ticker format: {ticker}")

        except Exception as e:
            logger.error(f"Error getting market price: {str(e)}")
            raise Exception(f"Failed to get market price: {str(e)}")

    async def place_grid_orders(self, symbol: str, price: float, quantity: float, side: str):
        """Place a limit order"""
        try:
            logger.info(f"Placing {side} order for {symbol} at {price} with quantity {quantity}")
            
            # Round price and quantity to appropriate decimals
            price = round(price, 6)  # 6 decimals for price
            quantity = round(quantity, 2)  # 2 decimals for quantity
            
            logger.info(f"Rounded values: price={price}, quantity={quantity}")
            
            response = self.client.order(
                symbol=symbol.lower(),
                price=price,
                quantity=quantity,
                side=side.upper(),
                type='LIMIT'
            )
            logger.info(f"Order response: {response}")
            return response
        except Exception as e:
            logger.error(f"Error placing order: {str(e)}")
            raise Exception(f"Failed to place {side} order: {str(e)}")

    async def get_open_orders(self, symbol: str = "aipg_usdt"):
        """Get all open orders for a symbol"""
        try:
            logger.info(f"Getting open orders for {symbol}")
            orders = self.client.get_open_orders(symbol=symbol.lower())
            logger.info(f"Open orders response: {orders}")
            return orders
        except Exception as e:
            logger.error(f"Error getting open orders: {str(e)}")
            return None

    async def cancel_all_orders(self, symbol: str):
        """Cancel all open orders for a symbol"""
        try:
            logger.info(f"Canceling all orders for {symbol}")
            orders = await self.get_open_orders(symbol)
            if not orders:
                return True

            for order in orders:
                try:
                    self.client.cancel_order(order_id=order['orderId'])
                    logger.info(f"Cancelled order {order['orderId']}")
                except Exception as e:
                    logger.error(f"Error canceling order {order['orderId']}: {str(e)}")

            return True
        except Exception as e:
            logger.error(f"Error canceling all orders: {str(e)}")
            return False

    async def get_filled_orders(self, symbol: str = "aipg_usdt"):
        """Get filled orders for a symbol"""
        try:
            logger.info(f"Getting filled orders for {symbol}")
            # Get orders with status "filled"
            orders = self.client.get_orders(
                symbol=symbol.lower(),
                status="filled"
            )
            logger.info(f"Filled orders response: {orders}")
            return orders
        except Exception as e:
            logger.error(f"Error getting filled orders: {str(e)}")
            return []

    async def create_grid(self, symbol: str, positions: int, total_amount: float, min_distance: float, max_distance: float):
        """Create a grid of buy and sell orders"""
        try:
            logger.info(f"Creating grid for {symbol} with {positions} positions")
            
            # Get current market price
            current_price = await self.get_market_price(symbol)
            if not current_price:
                raise Exception("Failed to get current market price")

            logger.info(f"Current market price: {current_price}")

            # Cancel existing orders
            await self.cancel_all_orders(symbol)

            # Calculate grid parameters
            amount_per_grid = total_amount / positions
            price_step = (max_distance - min_distance) / (positions - 1)

            logger.info(f"Grid parameters: amount_per_grid={amount_per_grid}, price_step={price_step}")

            # Place grid orders
            for i in range(positions):
                try:
                    distance = min_distance + (price_step * i)
                    
                    # Calculate buy and sell prices
                    buy_price = current_price * (1 - distance / 100)
                    sell_price = current_price * (1 + distance / 100)
                    
                    logger.info(f"Grid level {i}: distance={distance}%, buy={buy_price}, sell={sell_price}")
                    
                    # Place buy order
                    buy_order = await self.place_grid_orders(
                        symbol=symbol,
                        price=buy_price,
                        quantity=amount_per_grid / buy_price,  # Convert USDT amount to token quantity
                        side='BUY'
                    )
                    
                    # Place sell order
                    sell_order = await self.place_grid_orders(
                        symbol=symbol,
                        price=sell_price,
                        quantity=amount_per_grid / sell_price,  # Convert USDT amount to token quantity
                        side='SELL'
                    )
                    
                    if not buy_order or not sell_order:
                        raise Exception("Failed to place grid orders")
                        
                except Exception as e:
                    logger.error(f"Error placing orders at grid level {i}: {str(e)}")
                    raise Exception(f"Failed at grid level {i}: {str(e)}")

            return True
        except Exception as e:
            logger.error(f"Error creating grid: {str(e)}")
            raise Exception(f"Grid creation failed: {str(e)}")
