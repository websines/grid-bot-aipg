'use client';

import { useState, useEffect } from 'react';

interface GridParams {
  symbol: string;
  positions: number;
  total_amount: number;
  min_distance: number;
  max_distance: number;
}

interface Balance {
  currency: string;
  availableAmount: string;
  frozenAmount: string;
  totalAmount: string;
}

interface Order {
  symbol: string;
  orderId: string;
  side: string;
  price: string;
  origQty: string;
  executedQty: string;
  type: string;
  state: string;
}

interface MarketInfo {
  symbol: string;
}

interface GridStatus {
  status: string;
  last_update: string;
  params: GridParams;
}

export default function GridTradingBot() {
  const [balances, setBalances] = useState<Balance | null>(null);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [gridParams, setGridParams] = useState<GridParams>({
    symbol: 'AIPG_USDT',
    positions: 20,
    total_amount: 200,
    min_distance: 0.5,
    max_distance: 10,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [gridStatus, setGridStatus] = useState<GridStatus | null>(null);

  useEffect(() => {
    fetchInitialData();
    // Poll grid status every minute
    const statusInterval = setInterval(fetchGridStatus, 60 * 1000);
    return () => clearInterval(statusInterval);
  }, []);

  const fetchInitialData = async () => {
    try {
      await Promise.all([
        fetchBalances(),
        fetchOpenOrders(),
        fetchMarketInfo(),
        fetchGridStatus()
      ]);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchBalances = async () => {
    try {
      console.log('Fetching balances...');
      const response = await fetch('http://localhost:8000/api/balance/usdt');
      console.log('Balance response:', response);
      const data = await response.json();
      console.log('Balance data:', data);
      setBalances(data);
    } catch (error) {
      console.error('Error fetching balances:', error);
      setBalances(null);
    }
  };

  const fetchOpenOrders = async () => {
    try {
      console.log('Fetching open orders...');
      const response = await fetch(`http://localhost:8000/api/orders/${gridParams.symbol}`);
      console.log('Orders response:', response);
      const data = await response.json();
      console.log('Orders data:', data);
      // Ensure we always set an array
      setOpenOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching open orders:', error);
      setOpenOrders([]);
    }
  };

  const fetchMarketInfo = async () => {
    try {
      console.log('Fetching market info...');
      const response = await fetch(`http://localhost:8000/api/market-info/${gridParams.symbol}`);
      console.log('Market info response:', response);
      const data = await response.json();
      console.log('Market info data:', data);
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to fetch market info');
      }
      
      setMarketInfo(data);
      
      // Also fetch current price
      const priceResponse = await fetch(`http://localhost:8000/api/market-price/${gridParams.symbol}`);
      const priceData = await priceResponse.json();
      console.log('Price data:', priceData);
      
      if (priceResponse.ok && priceData.price) {
        setCurrentPrice(priceData.price);
      }
    } catch (error) {
      console.error('Error fetching market info:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch market info');
    }
  };

  const fetchGridStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/grid/status');
      const data = await response.json();
      console.log('Grid status:', data);
      setGridStatus(data);
      setIsRunning(data.status === 'running');
    } catch (error) {
      console.error('Error fetching grid status:', error);
    }
  };

  const createGrid = async () => {
    try {
      setError(null);
      console.log('Creating grid with params:', gridParams);
      const response = await fetch('http://localhost:8000/api/grid/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gridParams),
      });

      const data = await response.json();
      console.log('Grid creation response:', data);

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to create grid');
      }

      setIsRunning(true);
      await Promise.all([fetchOpenOrders(), fetchGridStatus()]);
    } catch (error) {
      console.error('Error creating grid:', error);
      setError(error instanceof Error ? error.message : 'Failed to create grid');
      setIsRunning(false);
    }
  };

  const cancelGrid = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/grid/${gridParams.symbol}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel grid');
      }

      setIsRunning(false);
      await fetchOpenOrders();
    } catch (error) {
      console.error('Error canceling grid:', error);
    }
  };

  const stopGrid = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/grid/stop', {
        method: 'POST'
      });
      const data = await response.json();
      console.log('Stop grid response:', data);
      if (response.ok) {
        setIsRunning(false);
        setGridStatus(null);
        await fetchOpenOrders();
      } else {
        setError(data.detail || 'Failed to stop grid');
      }
    } catch (error) {
      console.error('Error stopping grid:', error);
      setError(error instanceof Error ? error.message : 'Failed to stop grid');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-6">Grid Trading Bot</h1>
      
      <div className="bg-gray-800 rounded-lg p-6 space-y-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl">Basic Services</h2>
            <span className={`px-2 py-1 rounded text-sm ${isRunning ? 'bg-green-500' : 'bg-red-500'}`}>
              {isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          {isRunning && (
            <button
              onClick={stopGrid}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Stop Grid
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded">
            {error}
          </div>
        )}

        {gridStatus?.status === 'running' && (
          <div className="bg-gray-700 rounded p-4 mb-4">
            <h3 className="text-lg mb-2">Grid Status</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Last Update</p>
                <p>{new Date(gridStatus.last_update).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-400">Total Amount</p>
                <p>{gridStatus.params.total_amount} USDT</p>
              </div>
              <div>
                <p className="text-gray-400">Grid Positions</p>
                <p>{gridStatus.params.positions}</p>
              </div>
              <div>
                <p className="text-gray-400">Distance Range</p>
                <p>{gridStatus.params.min_distance}% - {gridStatus.params.max_distance}%</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Positions</label>
              <input
                type="number"
                value={gridParams.positions}
                onChange={(e) => setGridParams({...gridParams, positions: Number(e.target.value)})}
                className="w-full p-2 rounded bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Total Amount (USDT)</label>
              <input
                type="number"
                value={gridParams.total_amount}
                onChange={(e) => setGridParams({...gridParams, total_amount: Number(e.target.value)})}
                className="w-full p-2 rounded bg-gray-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Min Distance (%)</label>
              <input
                type="number"
                value={gridParams.min_distance}
                onChange={(e) => setGridParams({...gridParams, min_distance: Number(e.target.value)})}
                className="w-full p-2 rounded bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Max Distance (%)</label>
              <input
                type="number"
                value={gridParams.max_distance}
                onChange={(e) => setGridParams({...gridParams, max_distance: Number(e.target.value)})}
                className="w-full p-2 rounded bg-gray-700"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={createGrid}
              disabled={isRunning}
              className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Start Grid Trading
            </button>
            <button
              onClick={cancelGrid}
              disabled={!isRunning}
              className="px-4 py-2 bg-red-500 rounded hover:bg-red-600 disabled:opacity-50"
            >
              Stop Grid Trading
            </button>
          </div>
        </div>

        {marketInfo && (
          <div className="bg-gray-700 rounded p-4 mb-4">
            <h3 className="text-lg mb-2">Market Info</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Symbol</p>
                <p>{marketInfo.symbol}</p>
              </div>
              <div>
                <p className="text-gray-400">Current Price</p>
                <p>{currentPrice ? currentPrice.toFixed(6) : 'N/A'} USDT</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-lg mb-2">Open Orders</h3>
          <div className="bg-gray-700 rounded p-4">
            {!openOrders || openOrders.length === 0 ? (
              <p>No open orders</p>
            ) : (
              <div>
                <div className="grid grid-cols-5 gap-4 mb-2 text-gray-400 text-sm">
                  <span>Side</span>
                  <span>Price</span>
                  <span>Amount</span>
                  <span>Filled</span>
                  <span>Status</span>
                </div>
                <ul className="space-y-2">
                  {openOrders.map((order) => (
                    <li key={order.orderId} className="grid grid-cols-5 gap-4">
                      <span className={order.side === 'BUY' ? 'text-green-500' : 'text-red-500'}>
                        {order.side}
                      </span>
                      <span>{parseFloat(order.price).toFixed(6)}</span>
                      <span>{parseFloat(order.origQty).toFixed(2)}</span>
                      <span>{parseFloat(order.executedQty).toFixed(2)}</span>
                      <span>{order.state}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {balances && (
          <div className="mt-6">
            <h3 className="text-lg mb-2">Available Balance</h3>
            <div className="bg-gray-700 rounded p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-400">Available</p>
                  <p>{parseFloat(balances.availableAmount).toFixed(2)} USDT</p>
                </div>
                <div>
                  <p className="text-gray-400">Frozen</p>
                  <p>{parseFloat(balances.frozenAmount).toFixed(2)} USDT</p>
                </div>
                <div>
                  <p className="text-gray-400">Total</p>
                  <p>{parseFloat(balances.totalAmount).toFixed(2)} USDT</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
