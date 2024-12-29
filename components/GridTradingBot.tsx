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
  current_price: number;
  balance: Balance;
  open_orders: Order[];
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
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [operationInProgress, setOperationInProgress] = useState<string>('');

  useEffect(() => {
    fetchInitialData();
    // Poll grid status every 30 seconds instead of every minute
    const statusInterval = setInterval(fetchGridStatus, 30 * 1000);
    return () => clearInterval(statusInterval);
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setLoadingMessage('Loading grid data...');
    try {
      // Fetch each data independently to avoid failing everything if one fails
      try {
        await fetchBalances();
      } catch (error) {
        console.error('Error fetching balances:', error);
      }
      
      try {
        await fetchOpenOrders();
      } catch (error) {
        console.error('Error fetching orders:', error);
      }
      
      try {
        await fetchMarketInfo();
      } catch (error) {
        console.error('Error fetching market info:', error);
      }
      
      try {
        await fetchGridStatus();
      } catch (error) {
        console.error('Error fetching grid status:', error);
      }
    } catch (error) {
      console.error('Error in fetchInitialData:', error);
      setError('Some data could not be loaded. The grid bot may still be functional.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const fetchBalances = async () => {
    try {
      setLoadingMessage('Fetching balances...');
      const response = await fetch('http://localhost:8000/api/balance/usdt');
      if (!response.ok) {
        throw new Error('Failed to fetch balances');
      }
      const data = await response.json();
      setBalances(data);
    } catch (error) {
      console.error('Error fetching balances:', error);
      setBalances(null);
      throw error;
    }
  };

  const fetchOpenOrders = async () => {
    try {
      setLoadingMessage('Fetching orders...');
      const response = await fetch(`http://localhost:8000/api/orders/${gridParams.symbol}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOpenOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching open orders:', error);
      setOpenOrders([]);
      throw error;
    }
  };

  const fetchMarketInfo = async () => {
    try {
      setLoadingMessage('Fetching market info...');
      const response = await fetch(`http://localhost:8000/api/market-info/${gridParams.symbol}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to fetch market info');
      }
      const data = await response.json();
      setMarketInfo(data);
      
      const priceResponse = await fetch(`http://localhost:8000/api/market-price/${gridParams.symbol}`);
      if (!priceResponse.ok) {
        throw new Error('Failed to fetch market price');
      }
      const priceData = await priceResponse.json();
      
      if (priceData.price) {
        setCurrentPrice(priceData.price);
      }
    } catch (error) {
      console.error('Error fetching market info:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch market info');
      throw error;
    }
  };

  const handleStatusUpdate = (data: any) => {
    if (data.status === 'running' && data.grid_state) {
      setIsRunning(true);
      setGridStatus(data.grid_state);
      setCurrentPrice(data.grid_state.current_price);
      if (data.grid_state.balance) {
        setBalances(data.grid_state.balance);
      }
      if (data.grid_state.open_orders) {
        setOpenOrders(data.grid_state.open_orders);
      }
    } else {
      setIsRunning(false);
      setGridStatus(null);
    }
  };

  const fetchGridStatus = async () => {
    // Don't show loading state for regular polling
    const isInitialLoad = !gridStatus;
    if (isInitialLoad) {
      setLoadingMessage('Checking grid status...');
    }
    
    try {
      const response = await fetch('http://localhost:8000/api/grid/status');
      if (!response.ok) {
        throw new Error('Failed to fetch grid status');
      }
      const data = await response.json();
      handleStatusUpdate(data);
      
      // Clear any existing error if the request succeeds
      if (error && error.includes('grid status')) {
        setError(null);
      }
    } catch (error) {
      console.error('Error fetching grid status:', error);
      // Only show error if it's not a network error (which could be temporary)
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        setError('Failed to fetch grid status. The connection to the server might be lost.');
      }
    }
  };

  const createGrid = async () => {
    try {
      setError(null);
      setOperationInProgress('create');
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

      handleStatusUpdate(data);
      await fetchOpenOrders();
    } catch (error) {
      console.error('Error creating grid:', error);
      setError(error instanceof Error ? error.message : 'Failed to create grid');
      setIsRunning(false);
    } finally {
      setOperationInProgress('');
    }
  };

  const cancelGrid = async () => {
    try {
      setOperationInProgress('cancel');
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
      setError(error instanceof Error ? error.message : 'Failed to cancel grid');
    } finally {
      setOperationInProgress('');
    }
  };

  const stopGrid = async () => {
    try {
      setOperationInProgress('stop');
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
    } finally {
      setOperationInProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-6">
        {/* Only show loading overlay for initial load */}
        {isLoading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg max-w-md w-full mx-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-300">{loadingMessage}</p>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Grid Trading Bot</h1>
            <p className="text-gray-400 mt-2">Automated trading for AIPG/USDT pair</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 ${isRunning ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="font-medium">{isRunning ? 'Active' : 'Inactive'}</span>
            </div>
            {isRunning && (
              <button
                onClick={stopGrid}
                disabled={operationInProgress !== ''}
                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {operationInProgress === 'stop' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                    Stopping...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Stop Bot
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Grid Parameters */}
          <div className="col-span-1 space-y-6">
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
              <h2 className="text-xl font-semibold mb-4">Grid Parameters</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Number of Grid Positions</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={gridParams.positions}
                      onChange={(e) => setGridParams({...gridParams, positions: Number(e.target.value)})}
                      className="w-full p-2.5 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      min="2"
                      max="50"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">positions</div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Total Investment</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={gridParams.total_amount}
                      onChange={(e) => setGridParams({...gridParams, total_amount: Number(e.target.value)})}
                      className="w-full p-2.5 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      min="10"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">USDT</div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Grid Range</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="number"
                        value={gridParams.min_distance}
                        onChange={(e) => setGridParams({...gridParams, min_distance: Number(e.target.value)})}
                        className="w-full p-2.5 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        min="0.1"
                        step="0.1"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={gridParams.max_distance}
                        onChange={(e) => setGridParams({...gridParams, max_distance: Number(e.target.value)})}
                        className="w-full p-2.5 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        min="0.1"
                        step="0.1"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</div>
                    </div>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-400">
                    <span>Min Distance</span>
                    <span>Max Distance</span>
                  </div>
                </div>

                <button
                  onClick={createGrid}
                  disabled={isRunning || operationInProgress !== ''}
                  className="w-full mt-4 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {operationInProgress === 'create' ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating Grid...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Start Grid Bot
                    </>
                  )}
                </button>
              </div>
            </div>

            {balances && (
              <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
                <h2 className="text-xl font-semibold mb-4">Wallet Balance</h2>
                <div className="space-y-4">
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Available Balance</div>
                    <div className="text-2xl font-semibold mt-1">{parseFloat(balances.availableAmount).toFixed(2)} <span className="text-sm text-gray-400">USDT</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400">Frozen</div>
                      <div className="text-lg font-medium mt-1">{parseFloat(balances.frozenAmount).toFixed(2)} <span className="text-sm text-gray-400">USDT</span></div>
                    </div>
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400">Total</div>
                      <div className="text-lg font-medium mt-1">{parseFloat(balances.totalAmount).toFixed(2)} <span className="text-sm text-gray-400">USDT</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Grid Status and Orders */}
          <div className="col-span-2 space-y-6">
            {gridStatus && (
              <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
                <h2 className="text-xl font-semibold mb-4">Grid Status</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Current Price</div>
                    <div className="text-2xl font-semibold mt-1">
                      {gridStatus.current_price ? gridStatus.current_price.toFixed(6) : 'N/A'}
                      <span className="text-sm text-gray-400 ml-1">USDT</span>
                    </div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Grid Positions</div>
                    <div className="text-2xl font-semibold mt-1">
                      {gridStatus.params.positions}
                      <span className="text-sm text-gray-400 ml-1">positions</span>
                    </div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Total Investment</div>
                    <div className="text-2xl font-semibold mt-1">
                      {gridStatus.params.total_amount}
                      <span className="text-sm text-gray-400 ml-1">USDT</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-400">
                  Last Update: {new Date(gridStatus.last_update).toLocaleString()}
                </div>
              </div>
            )}

            <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Active Orders</h2>
                <div className="px-3 py-1 bg-gray-700/50 rounded-full text-sm">
                  {openOrders?.length || 0} orders
                </div>
              </div>
              
              {!openOrders || openOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-lg">No active orders</p>
                  <p className="text-sm mt-1">Orders will appear here when the grid bot is running</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
                        <th className="pb-3 font-medium">Side</th>
                        <th className="pb-3 font-medium">Price (USDT)</th>
                        <th className="pb-3 font-medium">Amount</th>
                        <th className="pb-3 font-medium">Filled</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {openOrders.map((order) => (
                        <tr key={order.orderId} className="text-sm">
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              order.side === 'BUY' 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {order.side}
                            </span>
                          </td>
                          <td className="py-3">{parseFloat(order.price).toFixed(6)}</td>
                          <td className="py-3">{parseFloat(order.origQty).toFixed(2)}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-700 rounded-full h-1.5">
                                <div 
                                  className="bg-blue-500 h-1.5 rounded-full" 
                                  style={{width: `${(parseFloat(order.executedQty) / parseFloat(order.origQty)) * 100}%`}}
                                ></div>
                              </div>
                              <span>{parseFloat(order.executedQty).toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-1 bg-gray-700/50 rounded-full text-xs">
                              {order.state}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
