'use client';

import { useState, useEffect } from 'react';

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

interface GridParams {
  symbol: string;
  positions: number;
  total_amount: number;
  min_distance: number;
  max_distance: number;
}

interface GridStatus {
  symbol: string;
  current_price: number;
  balance: Balance;
  open_orders: Order[];
  positions: number;
  stats: {
    total_trades: number;
    total_volume: number;
    total_fees: number;
    realized_pnl: number;
  };
  total_amount: number;
  min_distance: number;
  max_distance: number;
  upper_price: number;
  lower_price: number;
  grid_spread: number;
  avg_distance: number;
  is_running: boolean;
  created_at: string;
  updated_at: string;
}

interface SortConfig {
  key: 'side' | 'price' | 'origQty' | 'executedQty' | 'state';
  direction: 'asc' | 'desc';
}

interface GridStatusResponse {
  is_running: boolean;
  grid_status: GridStatus;
}

export default function GridTradingBot() {
  const [balances, setBalances] = useState<Balance | null>(null);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [gridParams, setGridParams] = useState<GridParams>({
    symbol: 'BTCUSDT',
    positions: 5,
    total_amount: 100,
    min_distance: 0.5,
    max_distance: 10,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridStatus, setGridStatus] = useState<GridStatus | null>(null);
  const [operationInProgress, setOperationInProgress] = useState<'create' | 'stop' | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'price', direction: 'desc' });
  const [filterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [filterStatus] = useState<string>('ALL');

  useEffect(() => {
    void fetchInitialData();
    const statusInterval = setInterval(() => void fetchGridStatus(), 30 * 1000);
    return () => clearInterval(statusInterval);
  }, []);

  const fetchInitialData = async () => {
    try {
      setError(null);
      
      const response = await fetch('http://localhost:8000/api/grid/status');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch grid status');
      }

      const data = await response.json();
      handleStatusUpdate(data);
      
      if (data.grid_status) {
        if (data.grid_status.balance) {
          setBalances(data.grid_status.balance);
        }
        if (data.grid_status.open_orders) {
          setOpenOrders(data.grid_status.open_orders);
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch initial data');
    }
  };

  const fetchGridStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/grid/status');
      if (!response.ok) {
        throw new Error('Failed to fetch grid status');
      }
      const data = await response.json();
      handleStatusUpdate(data);
    } catch (error) {
      console.error('Error fetching grid status:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch grid status');
    }
  };

  const handleStatusUpdate = (data: GridStatusResponse) => {
    if (data.grid_status) {
      setIsRunning(data.is_running);
      setGridStatus(data.grid_status);
    } else {
      setIsRunning(false);
      setGridStatus(null);
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create grid');
      }

      const data = await response.json();
      handleStatusUpdate(data);
    } catch (error) {
      console.error('Error creating grid:', error);
      setError(error instanceof Error ? error.message : 'Failed to create grid');
      setIsRunning(false);
    } finally {
      setOperationInProgress('');
    }
  };

  const stopGrid = async () => {
    try {
      setOperationInProgress('stop');
      setError(null);
      
      const response = await fetch('http://localhost:8000/api/grid/stop', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to stop grid');
      }

      setIsRunning(false);
      setGridStatus(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to stop grid');
    } finally {
      setOperationInProgress('');
    }
  };

  const sortAndFilterOrders = (orders: Order[]): Order[] => {
    let filteredOrders = [...orders];
    
    if (filterSide !== 'ALL') {
      filteredOrders = filteredOrders.filter(order => order.side === filterSide);
    }
    if (filterStatus !== 'ALL') {
      filteredOrders = filteredOrders.filter(order => order.state === filterStatus);
    }

    return filteredOrders.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (sortConfig.key === 'price' || sortConfig.key === 'origQty' || sortConfig.key === 'executedQty') {
          return sortConfig.direction === 'asc' 
            ? parseFloat(aValue) - parseFloat(bValue)
            : parseFloat(bValue) - parseFloat(aValue);
        }
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return 0;
    });
  };

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const totalPages = Math.ceil((openOrders?.length || 0) / itemsPerPage);
  const paginatedOrders = openOrders 
    ? sortAndFilterOrders(openOrders).slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      )
    : [];

  useEffect(() => {
    setCurrentPage(1);
  }, [filterSide, filterStatus]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Grid Trading Bot</h1>
            <div className="flex items-center space-x-4">
              {isRunning ? (
                <>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    <span className="text-green-500">Running</span>
                  </div>
                  <button
                    onClick={stopGrid}
                    disabled={operationInProgress !== ''}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    {operationInProgress === 'stop' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Stopping...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        <span>Stop Bot</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                  <span className="text-gray-500">Inactive</span>
                </div>
              )}
            </div>
          </div>

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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
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

            <div className="lg:col-span-2 space-y-6">
              {gridStatus && (
                <>
                  {/* Grid Information Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    {/* Market Information */}
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-2">Market Information</div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Symbol:</span>
                          <span className="font-medium">{gridStatus.symbol}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Current Price:</span>
                          <span className="font-medium">{gridStatus.current_price?.toFixed(6)} USDT</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Available Balance:</span>
                          <span className="font-medium">
                            {gridStatus.balance?.availableAmount 
                              ? parseFloat(gridStatus.balance.availableAmount).toFixed(2)
                              : '0.00'} USDT
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Grid Configuration */}
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-2">Grid Configuration</div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Upper Price:</span>
                          <span className="font-medium">{gridStatus.upper_price?.toFixed(6)} USDT</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Lower Price:</span>
                          <span className="font-medium">{gridStatus.lower_price?.toFixed(6)} USDT</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Grid Spread:</span>
                          <span className="font-medium">{gridStatus.grid_spread?.toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Grid Distance:</span>
                          <span className="font-medium">{gridStatus.avg_distance?.toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Grid Lines:</span>
                          <span className="font-medium">{gridStatus.positions}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Investment:</span>
                          <span className="font-medium">{gridStatus.total_amount?.toFixed(2)} USDT</span>
                        </div>
                      </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-2">Performance</div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Total Trades:</span>
                          <span className="font-medium">{gridStatus.stats?.total_trades || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Total Volume:</span>
                          <span className="font-medium">
                            {gridStatus.stats?.total_volume?.toFixed(2) || '0.00'} USDT
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Total Fees:</span>
                          <span className="font-medium text-yellow-400">
                            {gridStatus.stats?.total_fees?.toFixed(2) || '0.00'} USDT
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Realized PnL:</span>
                          <span className={`font-medium ${
                            (gridStatus.stats?.realized_pnl || 0) >= 0 
                              ? 'text-green-400' 
                              : 'text-red-400'
                          }`}>
                            {gridStatus.stats?.realized_pnl?.toFixed(2) || '0.00'} USDT
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">ROI:</span>
                          <span className={`font-medium ${
                            (gridStatus.stats?.realized_pnl || 0) >= 0 
                              ? 'text-green-400' 
                              : 'text-red-400'
                          }`}>
                            {((gridStatus.stats?.realized_pnl || 0) / (gridStatus.total_amount || 1) * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Open Orders</h2>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-400">
                      Running Time: {gridStatus && gridStatus.created_at ? formatRunningTime(new Date(gridStatus.created_at)) : 'N/A'}
                    </span>
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
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
                            <th className="pb-3 font-medium">
                              <button
                                onClick={() => handleSort('side')}
                                className="flex items-center gap-1 hover:text-white"
                              >
                                Side
                                {sortConfig.key === 'side' && (
                                  <span className="text-blue-400">
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th className="pb-3 font-medium">
                              <button
                                onClick={() => handleSort('price')}
                                className="flex items-center gap-1 hover:text-white"
                              >
                                Price (USDT)
                                {sortConfig.key === 'price' && (
                                  <span className="text-blue-400">
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th className="pb-3 font-medium hidden sm:table-cell">
                              <button
                                onClick={() => handleSort('origQty')}
                                className="flex items-center gap-1 hover:text-white"
                              >
                                Amount
                                {sortConfig.key === 'origQty' && (
                                  <span className="text-blue-400">
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th className="pb-3 font-medium">
                              <button
                                onClick={() => handleSort('executedQty')}
                                className="flex items-center gap-1 hover:text-white"
                              >
                                Filled
                                {sortConfig.key === 'executedQty' && (
                                  <span className="text-blue-400">
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th className="pb-3 font-medium hidden lg:table-cell">
                              <button
                                onClick={() => handleSort('state')}
                                className="flex items-center gap-1 hover:text-white"
                              >
                                Status
                                {sortConfig.key === 'state' && (
                                  <span className="text-blue-400">
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {paginatedOrders.map((order) => (
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
                              <td className="py-3 hidden sm:table-cell">{parseFloat(order.origQty).toFixed(2)}</td>
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
                              <td className="py-3 hidden lg:table-cell">
                                <span className="px-2 py-1 bg-gray-700/50 rounded-full text-xs">
                                  {order.state}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 && (
                      <div className="mt-4 flex items-center justify-between border-t border-gray-700 pt-4">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 bg-gray-700/50 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                        >
                          Previous
                        </button>
                        <div className="text-sm text-gray-400">
                          Page {currentPage} of {totalPages}
                        </div>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1 bg-gray-700/50 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRunningTime(startTime: Date): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
