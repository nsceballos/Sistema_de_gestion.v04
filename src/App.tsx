import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Calendar, LayoutDashboard, LogOut, Home, Receipt } from 'lucide-react';
import ExpenseTracking from './components/ExpenseTracking';
import Dashboard from './components/Dashboard';
import ReservationManagement from './components/ReservationManagement';
import ReceiptManagement from './components/ReceiptManagement';
import Auth from './components/Auth';
import { authApi, AUTH_EXPIRED_EVENT, type Guest } from './lib/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [session, setSession] = useState<{ token: string; user: { id: string; email: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  /** Reserva desde la que se pidió "Generar recibo"; la pantalla de recibos la usa una sola vez */
  const [receiptGuest, setReceiptGuest] = useState<Guest | null>(null);

  useEffect(() => {
    const existing = authApi.getSession();
    setSession(existing);
    setLoading(false);

    // El cliente de la API avisa cuando el servidor rechaza el token (vencido o inválido)
    const onExpired = () => {
      setSession(null);
      setSessionExpired(true);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const handleSignOut = () => {
    authApi.signOut();
    setSession(null);
  };

  const handleCreateReceipt = (guest: Guest) => {
    setReceiptGuest(guest);
    setActiveTab('receipts');
  };

  const handleReceiptGuestConsumed = useCallback(() => setReceiptGuest(null), []);

  const handleAuthSuccess = (newSession: { token: string; user: { id: string; email: string } }) => {
    setSessionExpired(false);
    setSession(newSession);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!session) {
    return <Auth onAuthSuccess={handleAuthSuccess} sessionExpired={sessionExpired} />;
  }

  const navigation = [
    { name: 'Panel', icon: LayoutDashboard, tab: 'dashboard' },
    { name: 'Reservas', icon: Calendar, tab: 'reservations' },
    { name: 'Gastos', icon: DollarSign, tab: 'expenses' },
    { name: 'Recibos', icon: Receipt, tab: 'receipts' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Home className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" />
              <span className="ml-2 text-base sm:text-xl font-bold text-gray-900 whitespace-nowrap">Gestión Encantos</span>
            </div>

            {/* Desktop navigation */}
            <div className="hidden md:flex md:space-x-8">
              {navigation.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  className={`${
                    activeTab === item.tab
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 border-b-2 text-sm font-medium h-16`}
                >
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.name}
                </button>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <span className="hidden lg:block text-sm text-gray-500 truncate max-w-[180px]">
                {session.user.email}
              </span>
              <button
                onClick={handleSignOut}
                title="Cerrar sesión"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium whitespace-nowrap rounded-md text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content — extra bottom padding on mobile for the tab bar */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'reservations' && <ReservationManagement onCreateReceipt={handleCreateReceipt} />}
        {activeTab === 'expenses' && <ExpenseTracking />}
        {activeTab === 'receipts' && (
          <ReceiptManagement initialGuest={receiptGuest} onInitialGuestConsumed={handleReceiptGuestConsumed} />
        )}
      </main>

      {/* Bottom tab bar — below md (with 4 tabs the top bar no longer fits under 768px) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40">
        <div className="grid grid-cols-4 h-16">
          {navigation.map((item) => (
            <button
              key={item.tab}
              onClick={() => setActiveTab(item.tab)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeTab === item.tab
                  ? 'text-indigo-600'
                  : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <item.icon className={`h-6 w-6 ${activeTab === item.tab ? 'stroke-[2.5px]' : ''}`} />
              <span className="text-xs font-medium">{item.name}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default App;
