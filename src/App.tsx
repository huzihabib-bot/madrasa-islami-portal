import React, { useState, useEffect } from 'react';
import { auth, db, Student, DailyReport, handleFirestoreError, OperationType, googleProvider, Visitor } from './firebase';
import { onAuthStateChanged, User, signInWithEmailAndPassword, signOut, signInWithPopup } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp, orderBy, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  Users, 
  LayoutDashboard,
  Calendar, 
  BookOpen, 
  LogOut, 
  Plus, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Download, 
  ChevronRight,
  UserPlus,
  Settings,
  FileText,
  User as UserIcon,
  ShieldCheck,
  GraduationCap,
  Trash2,
  Timer,
  History,
  ArrowRight,
  Upload,
  Printer,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { generateStudentReportPDF } from './lib/pdf';

// Views
type View = 'login' | 'admin-dashboard' | 'parent-dashboard' | 'student-detail' | 'add-student' | 'edit-student' | 'teacher-class-view' | 'visitor-portal';
type LoginType = 'admin' | 'parent' | 'visitor';

interface MadrasaInfo {
  name: string;
  logoUrl?: string;
  address?: string;
  contact?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('login');
  const [isAdmin, setIsAdmin] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [madrasaInfo, setMadrasaInfo] = useState<MadrasaInfo>({
    name: 'جامعہ قرآنیہ',
    logoUrl: ''
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showVisitors, setShowVisitors] = useState(false);
  const [loginType, setLoginType] = useState<LoginType>('parent');

  const adminEmail = 'huzihabib@gmail.com';

  // Navigation with History
  const navigateView = (newView: View, state: any = {}) => {
    setView(newView);
    window.history.pushState({ view: newView, ...state }, '');
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
        if (event.state.student) setSelectedStudent(event.state.student);
        if (event.state.teacher) setSelectedTeacher(event.state.teacher);
      } else {
        if (user) {
          setView(isAdmin ? 'admin-dashboard' : 'parent-dashboard');
        } else {
          setView('login');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, isAdmin]);

  useEffect(() => {
    // Fetch Madrasa Info
    const madrasaRef = doc(db, 'settings', 'madrasa');
    const unsubscribeMadrasa = onSnapshot(madrasaRef, (snapshot) => {
      if (snapshot.exists()) {
        setMadrasaInfo(snapshot.data() as MadrasaInfo);
      }
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        const isAdm = u.email === adminEmail;
        setIsAdmin(isAdm);
        
        let targetView: View = isAdm ? 'admin-dashboard' : 'parent-dashboard';
        
        // If Google Login provider used and NOT the admin
        if (!isAdm && u.providerData.some(p => p.providerId === 'google.com')) {
          try {
            const visitorRef = doc(db, 'visitors', u.uid);
            const visitorSnap = await getDoc(visitorRef);
            
            if (visitorSnap.exists()) {
              const vData = visitorSnap.data();
              if (vData.status === 'approved') {
                targetView = 'admin-dashboard'; // Approved visitors see admin dashboard but rules will restrict them
              } else {
                targetView = 'visitor-portal';
              }
            } else {
              // First time logging in with Google
              await setDoc(visitorRef, {
                uid: u.uid,
                email: u.email,
                displayName: u.displayName || 'Visitor',
                photoURL: u.photoURL || '',
                status: 'pending',
                requestedAt: Timestamp.now()
              });
              targetView = 'visitor-portal';
            }
          } catch (err) {
            console.error('Visitor Check Error:', err);
            targetView = 'visitor-portal';
          }
        }

        setView(targetView);
        window.history.replaceState({ view: targetView }, '');
      } else {
        setView('login');
        window.history.replaceState({ view: 'login' }, '');
      }
      setLoading(false);
    });
    return () => {
      unsubscribeMadrasa();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (user && isAdmin && view === 'admin-dashboard') {
      const q = collection(db, 'students');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(list);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'students'));
      return () => unsubscribe();
    }
  }, [user, isAdmin, view]);

  useEffect(() => {
    if (selectedStudent) {
      const q = query(
        collection(db, `students/${selectedStudent.id}/reports`),
        orderBy('date', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport));
        setReports(list);
      }, (err) => handleFirestoreError(err, OperationType.LIST, `students/${selectedStudent.id}/reports`));
      return () => unsubscribe();
    }
  }, [selectedStudent]);

  const handleLogout = async () => {
    await signOut(auth);
    navigateView('login');
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.registrationNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50/30">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // If logged in, we use the dashboard layout
  if (view !== 'login') {
    return (
      <div className="flex min-h-screen bg-emerald-50/20 font-sans text-slate-900 overflow-hidden">
        {/* Mobile Navigation (Bottom Bar) */}
        {isAdmin && (
          <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-emerald-100 flex justify-around items-center p-4 z-50 md:hidden no-print">
            <button 
              onClick={() => navigateView('admin-dashboard')}
              className={`flex flex-col items-center gap-1 ${view === 'admin-dashboard' ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              <LayoutDashboard className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase">ڈیش بورڈ</span>
            </button>
            <button 
              onClick={() => navigateView('add-student')}
              className={`flex flex-col items-center gap-1 ${view === 'add-student' ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              <UserPlus className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase">نیا داخلہ</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex flex-col items-center gap-1 text-red-400"
            >
              <LogOut className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase">لاگ آؤٹ</span>
            </button>
          </nav>
        )}

        {/* Sidebar Navigation (Desktop) */}
        {isAdmin && (
          <aside className="w-64 bg-white border-r border-slate-100 flex flex-col p-6 sticky top-0 h-screen hidden md:flex print:hidden">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100 overflow-hidden shrink-0">
                {madrasaInfo.logoUrl ? (
                  <img src={madrasaInfo.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <GraduationCap className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-slate-800 leading-none truncate max-w-[150px]">{madrasaInfo.name}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">اسلامی تعلیم</span>
              </div>
            </div>

            <nav className="space-y-1 flex-1">
              <button 
                onClick={() => { navigateView('admin-dashboard'); setSelectedStudent(null); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${view.includes('dashboard') ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <Users className="w-5 h-5" />
                طلباء کی فہرست
              </button>
              <button 
                onClick={() => navigateView('add-student')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${view === 'add-student' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <UserPlus className="w-5 h-5" />
                نیا داخلہ
              </button>
              <button 
                onClick={() => setShowVisitors(true)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${showVisitors ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <UserIcon className="w-5 h-5 text-sky-500" />
                مہمانوں کی اجازت
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${showSettings ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <Settings className="w-5 h-5" />
                ترتیبات
              </button>
            </nav>

            <div className="mt-auto pt-6 border-t border-slate-50">
              <div className="flex items-center gap-3 px-2 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm border border-white">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-slate-800 truncate">{user?.email?.split('@')[0]}</p>
                  <div className="flex items-center gap-1">
                    <div className="w-1.2 h-1.2 rounded-full bg-sky-500"></div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">ایڈمنسٹریٹر</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 transition-all rounded-xl font-bold text-sm"
              >
                <LogOut className="w-4 h-4" />
                لاگ آؤٹ
              </button>
            </div>
          </aside>
        )}


        {/* Main Content Area */}
        <main className="flex-1 flex flex-col items-stretch h-screen overflow-y-auto pb-24 md:pb-0">
          {/* Header */}
          <header className={`min-h-20 border-b border-emerald-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 py-4 sticky top-0 z-40 print:hidden ${!isAdmin ? 'shadow-sm' : ''}`}>
            {!isAdmin && (
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-white" />
                 </div>
                 <span className="font-black text-emerald-900 tracking-tight text-sm hidden sm:block">{madrasaInfo.name}</span>
              </div>
            )}
            <div className="flex items-center md:hidden pr-2">
               {isAdmin && <GraduationCap className="w-8 h-8 text-emerald-600" />}
            </div>
            <div className={`flex-1 ${!isAdmin ? 'text-center' : ''}`}>
              <div className={`flex items-center gap-2 mb-0.5 ${!isAdmin ? 'justify-center' : ''}`}>
                 {selectedStudent && isAdmin && (
                   <button onClick={() => { navigateView('admin-dashboard'); setSelectedStudent(null); }} className="p-1 hover:bg-emerald-50 rounded-lg text-emerald-400">
                     <ChevronRight className="w-5 h-5 rotate-180" />
                   </button>
                 )}
                 <h1 className="text-2xl font-black text-emerald-900 tracking-tight flex items-center gap-2">
                  {selectedStudent ? selectedStudent.name : isAdmin ? 'طلباء کی فہرست' : 'بچے کی کارکردگی رپورٹ'}
                </h1>
              </div>
              <p className={`text-xs font-bold text-emerald-600/40 uppercase tracking-widest flex items-center gap-2 ${!isAdmin ? 'justify-center' : ''}`}>
                {selectedStudent ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>رجسٹریشن # {selectedStudent.registrationNumber}</span>
                    <span className="opacity-30">•</span>
                    <span>تعلیمی درجہ: {selectedStudent.currentClass}</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-3 h-3 text-emerald-600" />
                    <span>{format(new Date(), 'EEEE, dd MMMM yyyy')}</span>
                  </>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {isAdmin && (
                <div className="relative hidden xl:block">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 w-4 h-4" />
                  <input 
                    type="text"
                    placeholder="تلاش کریں..."
                    className="bg-emerald-50/50 border-none rounded-2xl py-3 pl-11 pr-4 text-sm font-medium focus:ring-4 focus:ring-emerald-100 outline-none w-72 transition-all text-right"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}
              {!isAdmin && (
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-xl font-bold text-xs hover:bg-red-100 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  لاگ آؤٹ
                </button>
              )}
            </div>
          </header>

          {/* Content Viewport */}
          <div className="p-8 pb-12 overflow-x-hidden">
            <AnimatePresence mode="wait">
              {view === 'admin-dashboard' && (
                <AdminDashboard 
                  students={filteredStudents} 
                  onSelectStudent={(s) => { setSelectedStudent(s); navigateView('student-detail', { student: s }); }}
                  isAdmin={isAdmin}
                  setView={(v: any) => navigateView(v)}
                  setEditingStudent={setEditingStudent}
                  setSelectedTeacher={(t: any) => { setSelectedTeacher(t); navigateView('teacher-class-view', { teacher: t }); }}
                />
              )}
              {view === 'parent-dashboard' && <ParentDashboard student={selectedStudent} madrasaInfo={madrasaInfo} onLogout={() => handleLogout()} />}
              {view === 'add-student' && <AddStudentForm onBack={() => navigateView('admin-dashboard')} />}
              {view === 'edit-student' && <AddStudentForm onBack={() => { navigateView('admin-dashboard'); setEditingStudent(null); }} initialData={editingStudent} />}
              {view === 'teacher-class-view' && selectedTeacher && (
                <TeacherClassView 
                  teacherName={selectedTeacher} 
                  students={students.filter(s => s.teacherName === selectedTeacher)} 
                  onBack={() => navigateView('admin-dashboard')}
                  onSelectStudent={(s) => { setSelectedStudent(s); navigateView('student-detail', { student: s }); }}
                />
              )}
              {view === 'student-detail' && selectedStudent && (
                <StudentDetail 
                  student={selectedStudent} 
                  reports={reports} 
                  onBack={() => { navigateView('admin-dashboard'); setSelectedStudent(null); }}
                  isAdmin={isAdmin}
                  madrasaInfo={madrasaInfo}
                />
              )}
              {view === 'visitor-portal' && user && <VisitorPortal user={user} onLogout={() => handleLogout()} />}
            </AnimatePresence>
          </div>
        </main>
        {showSettings && isAdmin && <SettingsModal info={madrasaInfo} onClose={() => setShowSettings(false)} />}
        {showVisitors && isAdmin && <VisitorManagement onClose={() => setShowVisitors(false)} />}
      </div>
    );
  }

  // Login View Wrapper
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-emerald-600/5 to-transparent pointer-events-none"></div>
      <LoginView 
        adminEmail={adminEmail}
        madrasaInfo={madrasaInfo}
        loginType={loginType}
        setLoginType={setLoginType}
        onLoginSuccess={(s, isAdm) => {
          if (isAdm) {
            setIsAdmin(true);
            navigateView('admin-dashboard');
          } else {
            setIsAdmin(false);
            setSelectedStudent(s);
            navigateView('parent-dashboard', { student: s });
          }
        }}
      />
    </div>
  );
}

// --- Views Components ---

function LoginView({ onLoginSuccess, adminEmail, madrasaInfo, loginType, setLoginType }: { 
    onLoginSuccess: (s: Student | null, isAdmin: boolean) => void, 
    adminEmail: string, 
    madrasaInfo: MadrasaInfo,
    loginType: LoginType,
    setLoginType: (t: LoginType) => void
  }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged in App.tsx will handle redirection based on email/visitor status
    } catch (err: any) {
      setError('گوگل لاگ ان ناکام رہا۔ براہ کرم دوبارہ کوشش کریں۔');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      if (loginType === 'admin') {
        // Admin Login logic
        const loginEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@madrasa.com`;
        const result = await signInWithEmailAndPassword(auth, loginEmail, trimmedPassword);
        if (result.user.email === adminEmail) {
           onLoginSuccess(null, true);
        } else {
          setError('ایڈمن کی معلومات غلط ہیں۔');
        }
      } else {
        // Parent Login logic
        const q = query(collection(db, 'students'), where('registrationNumber', '==', trimmedEmail));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const studentDoc = querySnapshot.docs[0];
          const studentData = { id: studentDoc.id, ...studentDoc.data() } as Student;
          
          if (studentData.password === trimmedPassword) {
            onLoginSuccess(studentData, false);
          } else {
            setError('غلط پاس ورڈ۔');
          }
        } else {
          setError('غلط رجسٹریشن آئی ڈی۔');
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('لاگ ان میں خرابی۔ براہ کرم اپنی معلومات چیک کریں۔');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200 border border-slate-100 p-8 sm:p-10 relative z-10"
    >
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-200 mb-6 overflow-hidden">
          {madrasaInfo?.logoUrl ? (
            <img src={madrasaInfo.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <GraduationCap className="w-10 h-10" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
          {loginType === 'admin' ? 'ایڈمن پورٹل لاگ ان' : loginType === 'visitor' ? 'وزیٹر پورٹل لاگ ان' : 'والدین پورٹل لاگ ان'}
        </h2>
        <p className="text-slate-500 mt-2 text-sm font-medium">{madrasaInfo?.name || 'مدرسہ پورٹل'}</p>
      </div>

      {loginType === 'visitor' ? (
        <div className="space-y-6 text-center">
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            اگر آپ مدرسہ کے والدین یا ایڈمن نہیں ہیں اور وزٹ کرنا چاہتے ہیں تو گوگل کے ذریعے لاگ ان کریں۔ آپ کو ایڈمن کی منظوری کے بعد رسائی ملے گی۔
          </p>
          <button 
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 px-5 py-4 rounded-xl font-bold text-sm text-slate-700 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebase/anonymous/google.png" className="w-6 h-6" alt="Google" referrerPolicy="no-referrer" />
            گوگل کے ساتھ لاگ ان کریں
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleLogin} className="space-y-5 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                {loginType === 'admin' ? 'ایڈمن ای میل' : 'رجسٹریشن آئی ڈی'}
              </label>
              <input 
                type="text" 
                required
                className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none transition-all font-medium text-slate-900"
                placeholder={loginType === 'admin' ? 'admin@example.com' : 'MIM-XXXX-202X'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">پاس ورڈ</label>
              <input 
                type="password" 
                required
                className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none transition-all font-mono"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-3">
                <XCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-[0.98]"
            >
              {loading ? 'تصدیق ہو رہی ہے...' : 'لاگ ان کریں'}
            </button>
          </form>

          {loginType === 'admin' && (
            <div className="mt-6">
              <button 
                disabled={loading}
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 px-5 py-3.5 rounded-xl font-bold text-sm text-slate-700 transition-all"
              >
                <img src="https://www.gstatic.com/firebase/anonymous/google.png" className="w-5 h-5" alt="Google" referrerPolicy="no-referrer" />
                Sign in with Google (Admin)
              </button>
            </div>
          )}
        </>
      )}

      <div className="mt-8 pt-6 border-t border-slate-100 text-center">
        {loginType !== 'parent' && (
          <button 
            onClick={() => { setLoginType('parent'); setError(''); }}
            className="text-emerald-600 font-bold text-sm hover:underline block w-full mb-3"
          >
            والدین کے لاگ ان کے لیے یہاں کلک کریں
          </button>
        )}
        {loginType !== 'admin' && (
          <button 
            onClick={() => { setLoginType('admin'); setError(''); }}
            className="text-emerald-600 font-bold text-sm hover:underline block w-full mb-3"
          >
            ایڈمن لاگ ان کے لیے یہاں کلک کریں
          </button>
        )}
        {loginType !== 'visitor' && (
          <button 
            onClick={() => { setLoginType('visitor'); setError(''); }}
            className="text-slate-500 font-bold text-xs hover:underline block w-full"
          >
            بطور مہمان (Visitor) لاگ ان کریں
          </button>
        )}
        <p className="text-slate-400 font-medium text-[10px] mt-4 leading-relaxed">
          {loginType === 'admin' 
            ? 'ایڈمن پورٹل - انتظامی رسائی کے لیے' 
            : loginType === 'visitor' ? 'وزیٹر پورٹل - محدود رسائی کے لیے' : 'والدین پورٹل - طلباء کی رپورٹ دیکھنے کے لیے'}
        </p>
      </div>

      <div className="mt-6 text-center">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-loose">
          محفوظ رسائی صرف مجاز صارفین کے لیے ہے۔<br/>
          پریشانی کی صورت میں انتظامیہ سے رابطہ کریں۔
        </p>
      </div>
    </motion.div>
  );
}

function LiveCounter({ date, label }: { date?: string, label: string }) {
  const [timeLeft, setTimeLeft] = useState({
    years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0
  });

  useEffect(() => {
    if (!date) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const target = new Date(date);
      
      let years = now.getFullYear() - target.getFullYear();
      let months = now.getMonth() - target.getMonth();
      let days = now.getDate() - target.getDate();
      let hours = now.getHours() - target.getHours();
      let minutes = now.getMinutes() - target.getMinutes();
      let seconds = now.getSeconds() - target.getSeconds();

      if (seconds < 0) { seconds += 60; minutes--; }
      if (minutes < 0) { minutes += 60; hours--; }
      if (hours < 0) { hours += 24; days--; }
      
      if (days < 0) {
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += prevMonth.getDate();
        months--;
      }
      if (months < 0) { months += 12; years--; }

      setTimeLeft({ years, months, days, hours, minutes, seconds });
    }, 1000);

    return () => clearInterval(interval);
  }, [date]);

  if (!date) return null;

  return (
    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col gap-2 items-center group hover:bg-white hover:shadow-lg transition-all duration-500">
      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-emerald-900">{timeLeft.years}</span><span className="text-[10px] font-bold text-emerald-400">سال</span>
        <span className="text-2xl font-black text-emerald-900">{timeLeft.months}</span><span className="text-[10px] font-bold text-emerald-400">ماہ</span>
        <span className="text-2xl font-black text-emerald-900">{timeLeft.days}</span><span className="text-[10px] font-bold text-emerald-400">دن</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex items-center gap-1 bg-emerald-100/30 px-3 py-1 rounded-full text-xs font-bold text-emerald-600 font-mono">
          <Clock className="w-3 h-3" />
          <span>{String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}</span>
          <span className="text-red-500 w-5">{String(timeLeft.seconds).padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ students, onSelectStudent, isAdmin, setView, setEditingStudent, setSelectedTeacher }: any) {
  const handleDeleteStudent = async (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    if (confirm(`کیا آپ واقعی ${student.name} کا مکمل ریکارڈ حذف کرنا چاہتے ہیں؟`)) {
      try {
        await deleteDoc(doc(db, 'students', student.id));
        alert('طالب علم کا ریکارڈ حذف کر دیا گیا۔');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'students');
      }
    }
  };

  const hifzCount = students.filter((s: Student) => s.currentClass.includes('حفظ')).length;
  const nazraCount = students.filter((s: Student) => s.currentClass.includes('ناظرہ') || s.currentClass.includes('قاعدہ')).length;
  const rihaishiCount = students.filter((s: Student) => s.residentialStatus === 'rihaishi').length;
  const totalCount = students.length;

  // Group by teacher
  const teacherGroups = students.reduce((acc: any, s: Student) => {
    const teacher = s.teacherName || 'بغیر استاد';
    if (!acc[teacher]) acc[teacher] = [];
    acc[teacher].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-12">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 no-print">
        <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">کل طلباء</span>
          </div>
          <div className="text-4xl font-black text-emerald-900 text-right">{totalCount}</div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center font-black">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">حفظ و ناظرہ</span>
          </div>
          <div className="flex justify-end gap-4">
            <div className="text-right">
              <span className="text-[8px] font-black text-sky-400 block">ناظرہ</span>
              <span className="text-2xl font-black text-sky-900">{nazraCount}</span>
            </div>
            <div className="text-right">
              <span className="text-[8px] font-black text-emerald-400 block">حفظ</span>
              <span className="text-2xl font-black text-emerald-900">{hifzCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">رہائشی حیثیت</span>
          </div>
          <div className="flex justify-end gap-4">
            <div className="text-right">
              <span className="text-[8px] font-black text-slate-400 block">غیر رہائشی</span>
              <span className="text-2xl font-black text-slate-900">{totalCount - rihaishiCount}</span>
            </div>
            <div className="text-right">
              <span className="text-[8px] font-black text-indigo-400 block">رہائشی</span>
              <span className="text-2xl font-black text-indigo-900">{rihaishiCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-black">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">کل اساتذہ</span>
          </div>
          <div className="text-4xl font-black text-amber-900 text-right">{Object.keys(teacherGroups).length}</div>
        </div>
      </div>

      {/* Main Student Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
        {students.map((student: Student) => (
          <motion.div 
            key={student.id}
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={() => onSelectStudent(student)}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:shadow-xl hover:border-emerald-400 transition-all duration-300 group relative flex flex-col justify-between"
          >
            {/* Action Buttons Overlay */}
            <div className="absolute top-4 left-4 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-all">
               {isAdmin && (
                 <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingStudent(student); setView('edit-student'); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => handleDeleteStudent(e, student)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-red-100 text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                 </>
               )}
            </div>
            
            <div>
              <div className="flex items-start justify-between mb-6">
                {student.imageUrl ? (
                  <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white shadow-sm shrink-0">
                    <img 
                      src={student.imageUrl} 
                      alt={student.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xl shadow-inner group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shrink-0">
                    {student.name.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col items-end gap-1.5">
                  <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${student.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    {student.status}
                  </div>
                  {student.residentialStatus && (
                    <div className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase border ${student.residentialStatus === 'rihaishi' ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                      {student.residentialStatus === 'rihaishi' ? 'رہائشی' : 'غیر رہائشی'}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-1">
                 <h3 className="text-lg font-bold text-slate-800 group-hover:text-emerald-700 transition-colors text-right w-full">{student.name}</h3>
                <p className="text-slate-400 font-bold flex items-center justify-end text-xs w-full">
                  <span className="opacity-30 italic mr-1 text-[9px]">W/O</span> {student.fatherName}
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-50">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-slate-300" />
                {student.registrationNumber}
              </div>
              <div className="text-[10px] font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-lg">
                {student.currentClass}
              </div>
            </div>
          </motion.div>
        ))}

        {students.length === 0 && (
          <div className="col-span-full py-40 text-center bg-white rounded-2xl border-4 border-dashed border-slate-100 no-print">
            <Users className="w-20 h-20 mx-auto text-emerald-100 mb-8" />
            <h3 className="text-3xl font-black text-emerald-900/10 tracking-tighter">کوئی طالب علم نہیں ملا</h3>
            <p className="text-emerald-400/30 font-bold uppercase tracking-widest text-[10px] mt-2">تلاش کو تبدیل کریں یا نیا داخلہ کریں</p>
          </div>
        )}
      </div>

      {/* Teacher Sections */}
      <div className="space-y-12 no-print">
        <div className="flex items-center justify-end gap-4 mb-4">
           <div className="h-px flex-1 bg-emerald-100"></div>
           <h3 className="text-2xl font-black text-emerald-900 pr-4">اساتذہ کی ترتیب</h3>
        </div>
        
        {Object.entries(teacherGroups).map(([teacher, group]: any) => (
          <div 
            key={teacher} 
            onClick={() => { setSelectedTeacher(teacher); setView('teacher-class-view'); }}
            className="bg-white p-8 rounded-2xl border border-slate-100 space-y-6 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between px-4">
               <div className="flex items-center gap-2">
                 <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                   {group.length} طلباء
                 </div>
                 <ChevronRight className="w-4 h-4 text-emerald-300 opacity-0 group-hover:opacity-100 transition-all" />
               </div>
               <h4 className="text-xl font-black text-emerald-800">{teacher}</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
               {group.map((s: Student) => (
                 <div 
                  key={s.id} 
                  onClick={(e) => { e.stopPropagation(); onSelectStudent(s); }}
                  className="bg-white p-4 rounded-3xl border border-emerald-100 hover:border-emerald-400 transition-all cursor-pointer text-center group"
                 >
                    <div className="w-12 h-12 rounded-2xl mx-auto mb-3 bg-emerald-50 flex items-center justify-center text-emerald-600 font-black overflow-hidden">
                       {s.imageUrl ? (
                         <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                       ) : s.name.charAt(0)}
                    </div>
                    <p className="text-[10px] font-black text-emerald-900 truncate">{s.name}</p>
                    <p className="text-[8px] font-bold text-slate-400 truncate uppercase mt-1">{s.currentClass}</p>
                 </div>
               ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddStudentForm({ onBack, initialData }: { onBack: () => void, initialData?: Student | null }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    fatherName: initialData?.fatherName || '',
    whatsappNumber: initialData?.whatsappNumber || '',
    bFormNumber: initialData?.bFormNumber || '',
    imageUrl: initialData?.imageUrl || '',
    address: initialData?.address || '',
    currentClass: initialData?.currentClass || '',
    teacherName: (initialData as any)?.teacherName || '',
    dob: initialData?.dob || '',
    admissionDate: initialData?.admissionDate || new Date().toISOString().split('T')[0],
    registrationNumber: initialData?.registrationNumber || '',
    residentialStatus: initialData?.residentialStatus || 'gair-rihaishi' as const,
    password: initialData?.password || Math.random().toString(36).slice(-8),
    status: initialData?.status || 'active' as const
  });
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // No auto-gen for registrationNumber anymore
    const handleWordUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      alert('براہ کرم صرف Word (.docx) فائل منتخب کریں۔');
      return;
    }

    setExtracting(true);
    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      
      // Look for the first image in word/media/
      const mediaFolder = content.folder('word/media');
      if (mediaFolder) {
        const imageFile = Object.values(mediaFolder.files).find(f => 
          !f.dir && (f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') || f.name.endsWith('.png') || f.name.endsWith('.webp'))
        );

        if (imageFile) {
          const blob = await imageFile.async('blob');
          const reader = new FileReader();
          reader.onloadend = () => {
            setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
            setExtracting(false);
          };
          reader.readAsDataURL(blob);
        } else {
          alert('اس فائل میں کوئی تصویر نہیں ملی۔');
          setExtracting(false);
        }
      } else {
        alert('اس فائل میں میڈیا کا کوئی فولڈر نہیں ملا۔');
        setExtracting(false);
      }
    } catch (err) {
      console.error('Word extraction error:', err);
      alert('فائل سے تصویر نکالنے میں خرابی پیش آئی۔');
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.registrationNumber) {
      alert('براہ کرم رجسٹریشن آئی ڈی درج کریں۔');
      return;
    }
    setLoading(true);
    try {
      if (initialData) {
        await updateDoc(doc(db, 'students', initialData.id), {
          ...formData,
          createdAt: initialData.createdAt
        });
        alert('طالب علم کی معلومات تبدیل کر دی گئیں۔');
      } else {
        const studentId = doc(collection(db, 'students')).id;
        await setDoc(doc(db, 'students', studentId), {
            ...formData,
            id: studentId,
            createdAt: Timestamp.now()
          });
        alert(`داخلہ مکمل ہوا!\nرجسٹریشن آئی ڈی: ${formData.registrationNumber}\nپاس ورڈ: ${formData.password}`);
      }
      onBack();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-12 py-12 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/20">
          <div>
            <h2 className="text-4xl font-black text-emerald-900 tracking-tight">{initialData ? 'معلومات تبدیل کریں' : 'نیا داخلہ'}</h2>
            <p className="text-emerald-600/40 font-bold uppercase text-[10px] tracking-widest mt-2">{initialData ? 'مدرسہ رجسٹری اپ ڈیٹ' : 'مدرسہ رجسٹری میں نیا اندراج'}</p>
          </div>
          <button onClick={onBack} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-all shadow-sm">
            <XCircle className="w-8 h-8" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-12 space-y-12 text-right">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="md:col-span-2 flex flex-col items-center gap-6 mb-4">
              <div className="w-32 h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shadow-inner">
                {formData.imageUrl ? (
                  <img src={formData.imageUrl} className="w-full h-full object-cover" alt="Preview" referrerPolicy="no-referrer" />
                ) : (
                  <Users className="w-12 h-12 text-emerald-200" />
                )}
              </div>
              <div className="w-full max-w-md space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">ورڈ فائل سے تصویر منتخب کریں (.docx)</label>
                  <label className={`w-full flex items-center justify-center gap-3 px-6 py-5 rounded-2xl bg-white border-2 border-dashed ${extracting ? 'border-emerald-400 animate-pulse' : 'border-emerald-100 hover:border-emerald-400'} cursor-pointer transition-all`}>
                    <Upload className={`w-5 h-5 ${extracting ? 'text-emerald-500' : 'text-emerald-300'}`} />
                    <span className="text-sm font-bold text-slate-500">
                      {extracting ? 'تصویر نکالی جا رہی ہے...' : 'ورڈ فائل اپ لوڈ کریں'}
                    </span>
                    <input 
                      type="file" 
                      accept=".docx" 
                      className="hidden" 
                      onChange={handleWordUpload} 
                      disabled={extracting}
                    />
                  </label>
                </div>
                
                <div className="space-y-2 text-center">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-emerald-50"></div>
                    <span className="text-[8px] font-black text-emerald-200 uppercase">یا یو آر ایل استعمال کریں</span>
                    <div className="flex-1 h-px bg-emerald-50"></div>
                  </div>
                  <input 
                    type="url"
                    className="w-full px-6 py-4 rounded-xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 transition-all text-[10px] text-right font-mono"
                    placeholder="https://images.com/photo.jpg"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">طالب علم کا مکمل نام</label>
              <input 
                type="text" 
                required
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-bold text-emerald-900 text-right"
                placeholder="برتھ سرٹیفکیٹ کے مطابق نام"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">والد کا نام / سرپرست</label>
              <input 
                type="text" 
                required
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-bold text-emerald-900 text-right"
                value={formData.fatherName}
                onChange={(e) => setFormData({...formData, fatherName: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">ب فارم نمبر (13 ہندسے)</label>
              <input 
                type="text" 
                required
                maxLength={13}
                disabled={!!initialData}
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-mono font-bold text-right disabled:opacity-50"
                placeholder="00000-0000000-0"
                value={formData.bFormNumber}
                onChange={(e) => setFormData({...formData, bFormNumber: e.target.value.replace(/[^0-9]/g, '')})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">رابطہ نمبر (واٹس ایپ)</label>
              <input 
                type="tel"
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-mono font-bold text-right"
                placeholder="+92 3XX XXXXXXX"
                value={formData.whatsappNumber}
                onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">رہائشی پتہ</label>
              <textarea 
                className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-emerald-500 transition-all min-h-[120px] font-medium text-right"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">تعلیمی درجہ (کلاس)</label>
              <input 
                type="text"
                placeholder="حفظ / ناظرہ / نورانی قاعدہ"
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-bold text-right"
                value={formData.currentClass}
                onChange={(e) => setFormData({...formData, currentClass: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">استاد کا نام / قاری صاحب</label>
              <input 
                type="text"
                placeholder="مثلاً قاری طیب صاحب"
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-bold text-right"
                value={formData.teacherName}
                onChange={(e) => setFormData({...formData, teacherName: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">داخلہ کی تاریخ</label>
              <input 
                type="date"
                required
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 transition-all font-bold text-right"
                value={formData.admissionDate}
                onChange={(e) => setFormData({...formData, admissionDate: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">تاریخِ پیدائش</label>
              <input 
                type="date"
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 transition-all font-bold text-right"
                value={formData.dob}
                onChange={(e) => setFormData({...formData, dob: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">داخلہ نمبر / رجسٹریشن آئی ڈی</label>
              <input 
                type="text" 
                required
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-600 transition-all font-mono font-bold text-right"
                placeholder="مثلاً 2024001"
                value={formData.registrationNumber}
                onChange={(e) => setFormData({...formData, registrationNumber: e.target.value.replace(/[^0-9]/g, '')})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">رہائشی حیثیت</label>
              <select 
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white transition-all font-bold text-right appearance-none"
                value={formData.residentialStatus}
                onChange={(e) => setFormData({...formData, residentialStatus: e.target.value as any})}
              >
                <option value="gair-rihaishi">غیر رہائشی</option>
                <option value="rihaishi">رہائشی</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-1">حیثیت (Status)</label>
              <select 
                className="w-full px-8 py-5 rounded-3xl bg-emerald-50/30 border border-emerald-100 outline-none focus:bg-white transition-all font-bold text-right appearance-none"
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as any})}
              >
                <option value="active">فعال (Active)</option>
                <option value="graduated">فارغ التحصیل (Graduated)</option>
                <option value="inactive">غیر فعال (Inactive)</option>
              </select>
            </div>
          </div>

          <div className="p-10 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col xl:flex-row items-center gap-10">
            <div className="flex-1 text-right">
              <div className="flex items-center justify-end gap-2 mb-3">
                <h4 className="text-sm font-black text-emerald-900 uppercase tracking-[0.2em]">لاگ ان کی تفصیلات</h4>
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-emerald-700/60 text-xs font-bold leading-relaxed uppercase tracking-tight">سسٹم نے رجسٹریشن آئی ڈی اور پاس ورڈ تیار کر لیا ہے۔ براہ کرم یہ والدین کے ساتھ شیئر کریں۔</p>
            </div>
            <div className="flex flex-wrap gap-4 w-full xl:w-auto">
              <div className="flex-1 bg-white px-6 py-4 rounded-2xl border-2 border-emerald-200 shadow-sm min-w-[160px]">
                <span className="block text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">یوزر آئی ڈی</span>
                <span className="font-mono text-sm font-black text-emerald-900">{formData.registrationNumber}</span>
              </div>
              <div className="flex-1 bg-white px-6 py-4 rounded-2xl border-2 border-emerald-200 shadow-sm min-w-[160px]">
                <span className="block text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">خفیہ کوڈ</span>
                <span className="font-mono text-sm font-black text-emerald-900">{formData.password}</span>
              </div>
            </div>
          </div>

          <div className="pt-8">
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? 'محفوظ ہو رہا ہے...' : initialData ? 'معلومات اپ ڈیٹ کریں' : 'داخلہ مکمل کریں'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

function ChangeClassDialog({ student, onClose }: { student: Student, onClose: () => void }) {
  const [newClass, setNewClass] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass) return;
    setLoading(true);
    try {
      const history = (student as any).classHistory || [];
      const updatedHistory = [
        ...history,
        { from: student.currentClass, to: newClass, date: new Date().toISOString() }
      ];

      await updateDoc(doc(db, 'students', student.id), {
        currentClass: newClass,
        classHistory: updatedHistory
      });
      alert('کلاس تبدیل کر دی گئی۔');
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-md rounded-2xl p-10 shadow-2xl space-y-8 text-right border border-slate-100">
        <div>
          <h3 className="text-2xl font-black text-emerald-900">کلاس / قاری صاحب تبدیل کریں</h3>
          <p className="text-emerald-500/50 text-[10px] font-bold uppercase tracking-widest mt-1">موجودہ: {student.currentClass}</p>
        </div>
        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">نیا استاد / کلاس</label>
            <input 
              type="text" 
              required
              placeholder="مثلاً قاری خالد صاحب"
              className="w-full px-6 py-4 rounded-2xl bg-emerald-50 border border-emerald-100 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 text-right font-bold"
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
             <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-900 transition-all disabled:opacity-50">تبدیل کریں</button>
             <button type="button" onClick={onClose} className="px-6 py-4 rounded-2xl border border-emerald-100 text-slate-400 font-bold hover:bg-emerald-50">کینسل</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function StudentDetail({ student, reports: allReports, onBack, isAdmin, madrasaInfo }: { student: Student, reports: DailyReport[], onBack: () => void, isAdmin: boolean, madrasaInfo: MadrasaInfo }) {
  const [showAddReport, setShowAddReport] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printOptions, setPrintOptions] = useState({ performance: true, contact: true, general: true });
  const [showChangeClass, setShowChangeClass] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  
  // Date Filtering State
  const [dateFilter, setDateFilter] = useState({
     start: format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'),
     end: format(new Date(), 'yyyy-MM-dd')
  });

  const filteredReports = allReports.filter(report => {
    const reportDate = format((report.date as any)?.toDate ? (report.date as any).toDate() : new Date(report.date), 'yyyy-MM-dd');
    return reportDate >= dateFilter.start && reportDate <= dateFilter.end;
  });

  const handlePrint = () => {
    setShowPrintDialog(false);
    setTimeout(() => window.print(), 300);
  };

  const deleteReport = async (id: string) => {
    if (!confirm('کیا آپ واقعی اس ریکارڈ کو حذف کرنا چاہتے ہیں؟')) return;
    try {
      await deleteDoc(doc(db, `students/${student.id}/reports`, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'reports');
    }
  };

  const downloadFullReport = async () => {
    await generateStudentReportPDF(student, allReports);
  };

  const formatPreciseTime = (startDate: string) => {
    if (!startDate) return [];
    const start = new Date(startDate);
    const now = new Date();
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    let hours = now.getHours() - start.getHours();
    let minutes = now.getMinutes() - start.getMinutes();

    if (minutes < 0) {
      minutes += 60;
      hours--;
    }
    if (hours < 0) {
      hours += 24;
      days--;
    }
    if (days < 0) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += lastMonth.getDate();
      months--;
    }
    if (months < 0) {
      months += 12;
      years--;
    }

    const parts = [];
    if (years > 0) parts.push({ val: years, unit: 'سال', large: true });
    if (months > 0) parts.push({ val: months, unit: 'ماہ', large: true });
    if (days > 0) parts.push({ val: days, unit: 'دن', large: false });
    if (hours > 0) parts.push({ val: hours, unit: 'گھنٹے', large: false });
    if (minutes > 0) parts.push({ val: minutes, unit: 'منٹ', large: false });

    return parts;
  };

  const stats = {
    total: filteredReports.length,
    present: filteredReports.filter(r => r.attendance === 'present').length,
    absent: filteredReports.filter(r => r.attendance === 'absent').length,
    leave: filteredReports.filter(r => r.attendance === 'leave').length,
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-700">
      
      {/* Date Filters - TOP */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row-reverse items-center justify-between gap-6 no-print">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-emerald-600" />
          <h4 className="text-lg font-bold text-slate-800 tracking-tight">فلٹر برائے رپورٹ</h4>
        </div>
        <div className="flex flex-row-reverse items-center gap-4">
          <div className="flex flex-col items-end gap-1">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">از تاریخ</label>
             <input type="date" className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={dateFilter.start} onChange={(e) => setDateFilter({...dateFilter, start: e.target.value})} />
          </div>
          <div className="flex flex-col items-end gap-1">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">تا تاریخ</label>
             <input type="date" className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={dateFilter.end} onChange={(e) => setDateFilter({...dateFilter, end: e.target.value})} />
          </div>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:flex items-center justify-between border-b-2 border-emerald-600 pb-4 mb-6">
         <div className="text-right">
            <h1 className="text-2xl font-black text-emerald-900 leading-tight">{madrasaInfo.name} - تعلیمی رپورٹ</h1>
            <div className="flex gap-4 text-xs font-bold text-slate-600 mt-1">
               <span>طالب علم: {student.name}</span>
               <span>رول نمبر: {student.registrationNumber}</span>
               <span>تاریخ: {format(new Date(), 'dd/MM/yyyy')}</span>
            </div>
         </div>
         <div className="w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg overflow-hidden shrink-0">
            {madrasaInfo.logoUrl ? (
              <img src={madrasaInfo.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : madrasaInfo.name.charAt(0)}
         </div>
      </div>

      {/* Action Hero Section */}
      <div className="grid grid-cols-1 gap-10 print:gap-4">
        <div className="relative overflow-hidden bg-slate-900 p-8 md:p-10 rounded-2xl shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-10 group text-right print:bg-white print:text-black print:px-2 print:py-1 print:border print:border-slate-100 print:shadow-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none print:hidden"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-10 w-full print:gap-4 print:justify-between">
              <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-1 shrink-0 overflow-hidden shadow-2xl transition-transform duration-700 group-hover:scale-105 print:w-20 print:h-20 print:border-slate-100 print:shadow-none">
                {student.imageUrl ? (
                  <img 
                    src={student.imageUrl} 
                    alt={student.name}
                    className="w-full h-full object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800 rounded-xl text-4xl font-black text-emerald-400 print:bg-slate-100 print:text-slate-400">
                    {student.name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-4 print:space-y-1">
                <div className="space-y-4 text-center md:text-right print:text-right">
                    <div className="flex flex-col md:flex-row items-end md:items-center justify-end gap-3 md:gap-6 print:flex-row print:gap-3">
                      <div className="flex items-center gap-2 bg-emerald-600 px-3 py-1.5 rounded-lg border border-emerald-500 order-2 md:order-1 print:bg-emerald-50 print:border-emerald-100 print:px-2">
                        <GraduationCap className="w-3.5 h-3.5 text-white print:text-emerald-600" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white print:text-emerald-900 print:text-[8px]">{student.currentClass}</span>
                      </div>
                      <h3 className="text-3xl md:text-4xl font-black tracking-tight leading-tight order-1 md:order-2 print:text-xl">{student.name}</h3>
                    </div>
                  
                  <div className="flex flex-col md:flex-row items-end justify-end gap-3 print:flex-col print:items-end print:gap-1">
                    <p className="hidden md:block text-slate-400 font-bold uppercase text-[10px] tracking-widest opacity-80 leading-relaxed max-w-sm text-right print:hidden">تعلیمی و اخلاقی کارکردگی کا مکمل مشاہدہ۔</p>
                    <div className="flex flex-col items-center md:items-end gap-3 print:items-end print:gap-1">
                         <div className="flex flex-col items-center md:items-end gap-1 print:flex-row-reverse print:gap-3">
                          <span className="text-[10px] font-black text-emerald-400 print:text-slate-900 print:text-[9px]">والد: {student.fatherName}</span>
                          <span className="text-[10px] font-black text-sky-400 print:text-slate-600 print:text-[9px]">{student.whatsappNumber}</span>
                        </div>
                      {student.teacherName && (
                        <span className="text-[8px] font-black px-3 py-1 rounded-lg bg-amber-600/80 text-white border border-amber-400 print:bg-amber-100 print:text-amber-700 print:border-amber-200">
                          استاد: {student.teacherName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center md:justify-end gap-3 pt-6 no-print">
                  {isAdmin && (
                    <button 
                      onClick={() => setShowAddReport(true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      نیا سبق درج کریں
                    </button>
                  )}
                  <button 
                    onClick={() => setShowPrintDialog(true)}
                    className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl font-bold border border-white/10 flex items-center gap-2 backdrop-blur-sm transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    رپورٹ پرنٹ کریں
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={() => setShowChangeClass(true)}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl font-bold border border-white/10 flex items-center gap-2 backdrop-blur-sm transition-all"
                    >
                      <Settings className="w-4 h-4" />
                      کلاس / استاد تبدیل کریں
                    </button>
                  )}
                </div>
              </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 no-print print:grid-cols-4 print:gap-2">
           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-right print:p-2 print:border-slate-300">
              <span className="text-[10px] font-bold text-slate-400 block uppercase mb-1 print:text-[8px]">کل حاضری</span>
              <div className="text-3xl font-black text-slate-800 print:text-lg">{stats.total}</div>
           </div>
           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-right print:p-2 print:border-slate-300">
              <span className="text-[10px] font-bold text-emerald-400 block uppercase mb-1 print:text-[8px]">حاضر</span>
              <div className="text-3xl font-black text-emerald-600 print:text-lg">{stats.present}</div>
           </div>
           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-right print:p-2 print:border-slate-300">
              <span className="text-[10px] font-bold text-red-400 block uppercase mb-1 print:text-[8px]">غیر حاضر</span>
              <div className="text-3xl font-black text-red-600 print:text-lg">{stats.absent + stats.leave}</div>
           </div>
            {student.dob && (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-right print:p-2 print:border-slate-300">
                <span className="text-[10px] font-bold text-amber-400 block uppercase mb-1 print:text-[8px]">طالب علم کی عمر</span>
                <div className="text-amber-600 print:text-[8px] leading-relaxed flex flex-wrap justify-end gap-1">
                   {formatPreciseTime(student.dob).length > 0 ? formatPreciseTime(student.dob).map((p, i, arr) => (
                     <span key={i} className={`font-black ${p.large ? 'text-sm' : 'text-[9px]'}`}>
                       {p.val} {p.unit}{i < arr.length - 1 ? '،' : ''}
                     </span>
                   )) : <span className="text-[10px] font-bold">ابھی ابھی</span>}
                </div>
              </div>
           )}
           {student.admissionDate && (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-right print:p-2 print:border-slate-300">
                <span className="text-[10px] font-bold text-indigo-400 block uppercase mb-1 print:text-[8px]">مدرسہ میں وقت</span>
                <div className="text-indigo-600 print:text-[8px] leading-relaxed flex flex-wrap justify-end gap-1">
                   {formatPreciseTime(student.admissionDate).length > 0 ? formatPreciseTime(student.admissionDate).map((p, i, arr) => (
                     <span key={i} className={`font-black ${p.large ? 'text-sm' : 'text-[9px]'}`}>
                       {p.val} {p.unit}{i < arr.length - 1 ? '،' : ''}
                     </span>
                   )) : <span className="text-[10px] font-bold">ابھی ابھی</span>}
                </div>
              </div>
           )}
           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-right print:p-2 print:border-slate-300">
              <span className="text-[10px] font-bold text-sky-400 block uppercase mb-1 print:text-[8px]">تناسب</span>
              <div className="text-3xl font-black text-sky-600 print:text-lg">{stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%</div>
           </div>
        </div>
      </div>

      {/* Print Footer */}
      <div className="hidden print:flex items-end justify-between mt-20 pt-10 border-t border-slate-200">
         <div className="text-center w-40">
            <div className="h-0.5 bg-slate-200 mb-2"></div>
            <p className="text-[10px] font-bold text-slate-500">دستخط سرپرست</p>
         </div>
         <div className="text-center w-40">
            <div className="h-0.5 bg-slate-200 mb-2"></div>
            <p className="text-[10px] font-bold text-slate-500">دستخط استاد</p>
         </div>
         <div className="text-center w-40">
            <div className="h-0.5 bg-slate-200 mb-2"></div>
            <p className="text-[10px] font-bold text-slate-500">مہر ادارہ / پرنسپل</p>
         </div>
      </div>

      <AnimatePresence>
        {showPrintDialog && (
          <PrintDialog 
            options={printOptions} 
            setOptions={setPrintOptions} 
            onClose={() => setShowPrintDialog(false)} 
            onPrint={handlePrint}
          />
        )}
      </AnimatePresence>



      <div className="grid grid-cols-1 xl:grid-cols-[1fr,450px] gap-12 mt-12 no-print print:mt-4 print:grid-cols-1">
        {/* Left: Main History Ledger */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-right print:border-slate-300 print:shadow-none">
           <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between print:p-4">
              <div className="flex items-center gap-4 no-print">
                 {isAdmin && <button onClick={onBack} className="p-2 hover:bg-white rounded-lg text-slate-400 transition-all"><ChevronRight className="w-5 h-5" /></button>}
              </div>
              <h4 className="text-lg font-bold text-slate-800">تفصیلی تعلیمی ریکارڈ</h4>
           </div>
           
           <div className="overflow-x-auto print:overflow-visible">
             <table className="w-full">
               <thead>
                 <tr className="bg-slate-50/30 border-b border-slate-100 print:bg-white print:border-slate-300">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right print:px-2 print:py-2">حاضری</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right print:px-2 print:py-2">تاریخ</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right print:px-2 print:py-2">سبق / منزل</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right print:px-2 print:py-2">غلطیاں</th>
                    {isAdmin && <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-left no-print">اختیارات</th>}
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50 print:divide-slate-200">
                  {filteredReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50/30 transition-all print:break-inside-avoid">
                      <td className="px-6 py-4 print:px-2 print:py-2">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold border ${report.attendance === 'present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'} print:bg-none print:border-none print:p-0 print:text-[8px]`}>
                          {report.attendance === 'present' ? 'حاضر' : 'غیر حاضر'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600 print:px-2 print:py-2 print:text-[9px]">
                        {(report.date as any)?.toDate ? format((report.date as any).toDate(), 'dd MMM, yyyy') : format(new Date(report.date), 'dd MMM, yyyy')}
                      </td>
                      <td className="px-6 py-4 print:px-2 print:py-2">
                        <div className="text-xs font-bold text-slate-800 print:text-[9px]">{report.lesson}</div>
                        <div className="text-[10px] text-slate-400 font-bold print:text-[8px]">{report.description || 'تفصیل موجود نہیں۔'}</div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-800 print:px-2 print:py-2 print:text-[9px]">
                        {report.mistakes || '0'}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 no-print">
                           <div className="flex gap-2">
                             <button onClick={() => { setEditingReport(report); setShowAddReport(true); }} className="p-2 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-all"><Settings className="w-4 h-4" /></button>
                             <button onClick={() => deleteReport(report.id)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                           </div>
                        </td>
                      )}
                    </tr>
                  ))}
               </tbody>
             </table>
           </div>
        </div>

        {/* Right: Focused Feed with Calendar */}
        <div className="w-full xl:w-[450px] bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col max-h-[850px] overflow-hidden text-right">
           <div className="space-y-6 mb-8">
              <div className="flex items-center justify-between">
                <History className="w-5 h-5 text-emerald-600" />
                <h4 className="text-lg font-bold text-slate-800">تعلیمی ڈائری و حاضری</h4>
              </div>
              
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 block uppercase">تا تاریخ</label>
                  <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={dateFilter.end} onChange={(e) => setDateFilter({...dateFilter, end: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 block uppercase">از تاریخ</label>
                  <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={dateFilter.start} onChange={(e) => setDateFilter({...dateFilter, start: e.target.value})} />
                </div>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide">
              {filteredReports.map((report, idx) => (
                <div key={report.id || idx} className="relative pr-6 pb-6 border-r border-slate-100 last:pb-0 group">
                  <div className={`absolute right-[-5px] top-0 w-2.5 h-2.5 rounded-full ring-4 ring-white shadow-sm transition-all ${report.attendance === 'present' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                  <div className="bg-slate-50 rounded-xl p-4 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-[9px] font-bold text-slate-400">{(report.date as any)?.toDate ? format((report.date as any).toDate(), 'dd MMM, yyyy') : format(new Date(report.date), 'dd MMM, yyyy')}</span>
                       <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase ${report.attendance === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                         {report.attendance === 'present' ? 'حاضر' : 'غیر حاضر'}
                       </span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 leading-relaxed truncate">{report.lesson}</p>
                    {report.description && <p className="text-[10px] text-slate-400 font-medium mt-1 line-clamp-1">{report.description}</p>}
                  </div>
                </div>
              ))}
              {filteredReports.length === 0 && (
                <div className="py-20 text-center opacity-30 grayscale">
                  <History className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-xs font-bold">اس دورانیے میں کوئی ریکارڈ موجود نہیں ہے۔</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddReport && (
          <ReportForm 
            studentId={student.id} 
            onClose={() => { setShowAddReport(false); setEditingReport(null); }} 
            initialData={editingReport}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showChangeClass && (
          <ChangeClassDialog 
            student={student} 
            onClose={() => setShowChangeClass(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Teacher Class View & Print Logic ---

function PrintDialog({ 
  options, 
  setOptions, 
  onClose, 
  onPrint 
}: { 
  options: any, 
  setOptions: any, 
  onClose: () => void, 
  onPrint: () => void 
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 text-right">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-emerald-950/40 backdrop-blur-md"
      />
        <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl p-10 border border-slate-100"
      >
        <div className="flex items-center justify-between mb-8">
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100">
            <XCircle className="w-5 h-5" />
          </button>
          <div className="text-right">
            <h3 className="text-xl font-bold text-slate-800">پرنٹ کے اختیارات</h3>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">منتخب کریں کہ کیا کیا پرنٹ کرنا ہے</p>
          </div>
        </div>

        <div className="space-y-3 mb-8 text-right">
          {[
            { id: 'general', label: 'بنیادی معلومات', desc: 'نام، ولدیت اور رجسٹریشن نمبر' },
            { id: 'performance', label: 'تعلیمی ریکارڈ', desc: 'حالیہ سبق اور کلاس کی تفصیلات' },
            { id: 'contact', label: 'رابطہ کی تفصیلات', desc: 'والد کا نام، فون اور پتہ' }
          ].map((opt) => (
            <label 
              key={opt.id}
              className={`flex items-center justify-end gap-5 p-5 rounded-2xl border transition-all ${options[opt.id] ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-emerald-100'}`}
            >
              <div className="flex-1">
                <span className="block font-bold text-slate-800">{opt.label}</span>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{opt.desc}</span>
              </div>
              <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${options[opt.id] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200'}`}>
                {options[opt.id] && <CheckCircle className="w-4 h-4" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={options[opt.id]} 
                onChange={(e) => setOptions({ ...options, [opt.id]: e.target.checked })}
              />
            </label>
          ))}
        </div>

        <button 
          onClick={onPrint}
          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[11px] tracking-widest shadow-lg shadow-emerald-600/10 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
        >
          <Printer className="w-5 h-5" />
          پرنٹ کے لئے بھیجیں
        </button>
      </motion.div>
    </div>
  );
}

// --- Settings Modal ---

function VisitorPortal({ user, onLogout }: { user: User, onLogout: () => void }) {
  const [visitorStatus, setVisitorStatus] = useState<'pending' | 'approved' | 'rejected' | 'none'>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const visitorRef = doc(db, 'visitors', user.uid);
    const unsubscribe = onSnapshot(visitorRef, (snapshot) => {
      if (snapshot.exists()) {
        setVisitorStatus(snapshot.data().status);
      } else {
        setVisitorStatus('none');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-right">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl shadow-slate-200 border border-slate-100 text-center"
      >
        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center mb-8">
           {visitorStatus === 'pending' || visitorStatus === 'none' ? <Clock className="w-10 h-10" /> : <XCircle className="w-10 h-10 text-red-500" />}
        </div>
        
        <h2 className="text-2xl font-black text-slate-800 mb-4">
          {visitorStatus === 'rejected' ? 'رسائی مسترد کر دی گئی' : 'درخواست زیرِ غور ہے'}
        </h2>
        
        <p className="text-slate-500 font-medium leading-relaxed mb-8">
          {visitorStatus === 'rejected' 
            ? 'معذرت، آپ کی رسائی کی درخواست ایڈمن نے مسترد کر دی ہے۔' 
            : 'آپ کی لاگ ان کی درخواست ایڈمن کو بھیج دی گئی ہے۔ براہ کرم ایڈمن کی منظوری کا انتظار کریں۔'}
        </p>

        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 text-right">
          <div className="flex items-center gap-3 mb-2 justify-end">
            <span className="text-xs font-bold text-slate-800">{user.displayName}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">نام</span>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <span className="text-xs font-bold text-slate-800">{user.email}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ای میل</span>
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 text-red-500 font-bold hover:bg-red-50 py-4 rounded-xl transition-all"
        >
          <LogOut className="w-5 h-5" />
          لاگ آؤٹ کریں
        </button>
      </motion.div>
    </div>
  );
}

function VisitorManagement({ onClose }: { onClose: () => void }) {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'visitors'), orderBy('requestedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Visitor));
      setVisitors(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleStatusUpdate = async (visitorId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        status,
        approvedAt: status === 'approved' ? Timestamp.now() : null
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `visitors/${visitorId}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 text-right">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-white w-full max-w-4xl rounded-2xl shadow-2xl p-10 border border-slate-100 flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-8">
           <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><XCircle className="w-6 h-6" /></button>
           <h3 className="text-xl font-bold text-slate-800">مہمانوں کی درخواستیں</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : visitors.length === 0 ? (
            <div className="text-center py-20 text-slate-400">کوئی درخواست موجود نہیں۔</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right tracking-widest">اختیارات</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-center tracking-widest">درجہ</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right tracking-widest">ای میل</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase text-right tracking-widest">نام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visitors.map((visitor) => (
                  <tr key={visitor.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-start gap-2">
                        <button 
                          onClick={() => handleStatusUpdate(visitor.id, 'approved')}
                          className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
                        >
                          منظور کریں
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(visitor.id, 'rejected')}
                          className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-red-600 hover:text-white transition-all border border-red-100"
                        >
                          مسترد کریں
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-bold border ${
                          visitor.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          visitor.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                          'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {visitor.status === 'approved' ? 'منظور شدہ' : visitor.status === 'rejected' ? 'مسترد شدہ' : 'زیرِ غور'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{visitor.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs font-bold text-slate-800">{visitor.displayName}</span>
                        {visitor.photoURL && <img src={visitor.photoURL} alt={visitor.displayName} className="w-8 h-8 rounded-lg shadow-sm" referrerPolicy="no-referrer" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function SettingsModal({ info, onClose }: { info: MadrasaInfo, onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: info.name,
    logoUrl: info.logoUrl || '',
    address: info.address || '',
    contact: info.contact || ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'madrasa'), formData);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/madrasa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 text-right">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl p-10 border border-slate-100"
      >
        <div className="flex items-center justify-between mb-8">
           <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><XCircle className="w-6 h-6" /></button>
           <h3 className="text-xl font-bold text-slate-800">مدرسہ کی ترتیبات</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">مدرسہ کا نام</label>
            <input 
              type="text" 
              required
              className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-emerald-500 outline-none font-bold text-right"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">لوگو (Logo URL)</label>
            <input 
              type="text" 
              className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-emerald-500 outline-none font-sans text-left"
              placeholder="https://example.com/logo.png"
              value={formData.logoUrl}
              onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
            />
            <p className="text-[9px] text-slate-400 mt-1">تصویر کا براہ راست لنک یہاں پیسٹ کریں</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">پتہ (Address)</label>
            <input 
              type="text" 
              className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-emerald-500 outline-none font-bold text-right"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">رابطہ نمبر</label>
            <input 
              type="text" 
              className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-emerald-500 outline-none font-bold text-right"
              value={formData.contact}
              onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || success}
            className={`w-full py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-3 ${success ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
          >
            {loading ? 'محفوظ ہو رہا ہے...' : success ? <><CheckCircle className="w-5 h-5" /> محفوظ ہو گیا</> : 'معلومات محفوظ کریں'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function TeacherClassView({ teacherName, students, onBack, onSelectStudent }: { teacherName: string, students: Student[], onBack: () => void, onSelectStudent: (s: Student) => void }) {
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printOptions, setPrintOptions] = useState({ performance: true, contact: true, general: true });
  const [madrasaInfo, setMadrasaInfo] = useState<MadrasaInfo>({ name: 'جامعہ قرآنیہ' });

  useEffect(() => {
    const madrasaRef = doc(db, 'settings', 'madrasa');
    getDoc(madrasaRef).then((snapshot) => {
      if (snapshot.exists()) {
        setMadrasaInfo(snapshot.data() as MadrasaInfo);
      }
    });
  }, []);

  const handlePrint = () => {
    setShowPrintDialog(false);
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
      {showPrintDialog && (
        <PrintDialog 
          options={printOptions} 
          setOptions={setPrintOptions} 
          onClose={() => setShowPrintDialog(false)} 
          onPrint={handlePrint}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between bg-white p-8 rounded-2xl border border-slate-100 shadow-sm no-print">
         <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowPrintDialog(true)}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-600/10 hover:bg-emerald-700 transition-all"
            >
              <Printer className="w-4 h-4" />
              کلاس پرنٹ کریں
            </button>
            <button 
              onClick={onBack}
              className="px-6 py-3 border border-slate-200 text-slate-400 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
            >
              واپس جائیں
            </button>
         </div>
         <div className="text-right">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{teacherName} کی کلاس</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">کل طلباء: {students.length}</p>
         </div>
      </div>

      {/* Print Header (Only visible during print) */}
      <div className="hidden print:flex items-center justify-between border-b-2 border-emerald-600 pb-4 mb-6">
         <div className="text-right">
            <h1 className="text-2xl font-black text-emerald-900 leading-tight">{madrasaInfo.name} - کلاس ریکارڈ</h1>
            <div className="flex gap-4 text-xs font-bold text-slate-600 mt-1">
               <span>استاد: {teacherName}</span>
               <span>تاریخ: {new Date().toLocaleDateString('ur-PK')}</span>
            </div>
         </div>
         <div className="w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg overflow-hidden shrink-0">
            {madrasaInfo.logoUrl ? (
              <img src={madrasaInfo.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : madrasaInfo.name.charAt(0)}
         </div>
      </div>

      {/* Class Register / Student List */}
      <div className="grid grid-cols-1 gap-4 print:gap-0">
        {students.map((student, index) => (
          <div 
            key={student.id}
            onClick={() => onSelectStudent(student)}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex items-center gap-6 print:rounded-none print:border-b print:border-slate-200 print:shadow-none print:p-2 print:gap-4 print:break-inside-avoid"
          >
             <div className="hidden print:block font-black text-slate-300 text-sm w-6 shrink-0">#{index + 1}</div>
             
             <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 text-xl font-black shrink-0 overflow-hidden border-2 border-white shadow-sm print:w-10 print:h-10 print:rounded-lg">
                {student.imageUrl ? (
                  <img src={student.imageUrl} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : student.name.charAt(0)}
             </div>

             <div className="flex-1 grid grid-cols-1 md:grid-cols-4 print:flex print:items-center print:justify-between gap-4 text-right">
                {printOptions.general && (
                  <div className="col-span-1 border-r border-slate-50 pr-6 print:border-none print:pr-0 print:flex-1">
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5 print:hidden">طالب علم</span>
                    <h4 className="text-lg font-bold text-slate-800 print:text-sm">{student.name}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase print:text-[8px]">{student.registrationNumber}</p>
                  </div>
                )}
                
                {printOptions.performance && (
                  <div className="col-span-2 space-y-1 print:space-y-0 print:flex-1 print:text-center">
                    <div className="flex items-center justify-end print:justify-center gap-3 print:gap-1">
                       <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-[10px] font-bold border border-emerald-100 print:bg-none print:border-none print:p-0 print:text-[9px]">{student.currentClass}</span>
                       <span className="text-xs font-bold text-slate-600 print:text-[9px]">سبق: {(student as any).lastLesson || '---'}</span>
                    </div>
                  </div>
                )}

                {printOptions.contact && (
                  <div className="col-span-1 border-l border-slate-50 pl-6 text-left md:text-right print:border-none print:pl-0 print:flex-1 print:text-left">
                    <div className="print:flex print:flex-col print:items-start">
                      <p className="text-xs font-bold text-slate-600 print:text-[9px]">{student.fatherName}</p>
                      <p className="text-[9px] font-black text-emerald-600 print:text-[8px]">{student.whatsappNumber}</p>
                    </div>
                  </div>
                )}
             </div>

             <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 transition-all no-print">
                <ChevronRight className="w-5 h-5" />
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportForm({ studentId, onClose, initialData }: any) {
  const [formData, setFormData] = useState({
    date: initialData?.date || format(new Date(), 'yyyy-MM-dd'),
    attendance: initialData?.attendance || 'present' as DailyReport['attendance'],
    type: initialData?.type || 'qaida' as DailyReport['type'],
    lesson: initialData?.lesson || '',
    mistakes: initialData?.mistakes || '',
    teacherName: initialData?.teacherName || '',
    notes: initialData?.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const reportId = initialData?.id || doc(collection(db, `students/${studentId}/reports`)).id;
      const isNew = !initialData;
      
      await setDoc(doc(db, `students/${studentId}/reports`, reportId), {
        ...formData,
        studentId,
        updatedAt: Timestamp.now()
      });

      // Update student's last lesson if it's the latest report
      // For simplicity, we update it regardless for new reports or edits
      await updateDoc(doc(db, 'students', studentId), {
        lastLesson: formData.lesson
      });

      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'reports');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="px-10 py-8 bg-emerald-600 flex items-center justify-between text-white border-b border-emerald-500">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all"><XCircle className="w-6 h-6" /></button>
          <div className="text-right">
            <h3 className="text-xl font-bold">{initialData ? 'ریکارڈ تبدیل کریں' : 'روزانہ کی رپورٹ'}</h3>
            <p className="text-emerald-100/80 text-[10px] font-bold uppercase tracking-widest mt-1">تعلیمی سنگ میل کی ٹریکنگ</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8 overflow-y-auto max-h-[75vh] text-right">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تاریخ</label>
              <input 
                type="date" 
                required
                className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-emerald-500 outline-none font-bold text-right"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">حاضری</label>
              <select 
                className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-emerald-500 font-bold text-right appearance-none"
                value={formData.attendance}
                onChange={(e) => setFormData({...formData, attendance: e.target.value as any})}
              >
                <option value="present">حاضر</option>
                <option value="absent">غیر حاضر</option>
                <option value="leave">رخصت</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 p-1.5 bg-slate-50 rounded-xl border border-slate-100">
             <button 
                type="button"
                onClick={() => setFormData({...formData, type: 'quran'})}
                className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${formData.type === 'quran' ? 'bg-white shadow-sm text-emerald-600 border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
             >
                قرآن مجید
             </button>
             <button 
                type="button"
                onClick={() => setFormData({...formData, type: 'qaida'})}
                className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${formData.type === 'qaida' ? 'bg-white shadow-sm text-emerald-600 border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
             >
                نورانی قاعدہ
             </button>
          </div>

          <div className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">سبق / منزل</label>
              <input 
                type="text" 
                placeholder={formData.type === 'qaida' ? 'مثلاً تختی 5، صفحہ 12' : 'مثلاً سورۃ البقرہ، آیات 1-10'}
                className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-emerald-500 font-bold text-right"
                value={formData.lesson}
                onChange={(e) => setFormData({...formData, lesson: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">غلطیاں / اصلاح</label>
              <input 
                type="text" 
                placeholder="تعداد یا کوئی خاص نوٹ..."
                className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-emerald-500 font-bold text-right"
                value={formData.mistakes}
                onChange={(e) => setFormData({...formData, mistakes: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">استاد کا نام / قاری صاحب</label>
              <input 
                type="text" 
                placeholder="مثلاً قاری طیب صاحب"
                className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-emerald-500 font-bold text-right"
                value={formData.teacherName}
                onChange={(e) => setFormData({...formData, teacherName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">استاد کے نوٹس</label>
              <textarea 
                placeholder="بچے کی توجہ اور کارکردگی کی تفصیل..."
                className="w-full px-5 py-4 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-emerald-500 transition-all min-h-[120px] font-medium text-sm text-right"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {loading ? 'محفوظ ہو رہا ہے...' : 'رپورٹ محفوظ کریں'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ParentDashboard({ student: initialStudent, madrasaInfo, onLogout }: { student: Student | null, madrasaInfo: MadrasaInfo, onLogout: () => Promise<void> }) {
    const [student, setStudent] = useState<Student | null>(initialStudent);
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (student) {
            const fetchReports = async () => {
                try {
                    const qReports = query(
                        collection(db, `students/${student.id}/reports`),
                        orderBy('date', 'desc')
                    );
                    onSnapshot(qReports, (snapshot) => {
                        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport));
                        setReports(list);
                        setLoading(false);
                    });
                } catch (err) {
                    console.error('Record accessibility error:', err);
                    setLoading(false);
                }
            };
            fetchReports();
        } else {
          setLoading(false);
        }
    }, [student]);

    if (loading) return (
      <div className="flex flex-col items-center justify-center py-40 gap-6">
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity }} className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center">
          <Clock className="w-6 h-6 text-emerald-600" />
        </motion.div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">تعلیمی ریکارڈ تلاش کیا جا رہا ہے...</p>
      </div>
    );

    if (!student) return (
      <div className="flex flex-col items-center justify-center py-40 gap-6 text-center max-w-sm mx-auto">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center border border-red-100">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">ریکارڈ میں خرابی</h3>
          <p className="text-slate-400 font-medium text-xs leading-relaxed px-4">ہم آپ کے اکاؤنٹ کو کسی طالب علم کے پروفائل سے منسلک نہیں کر سکے ہیں۔ براہ کرم ایڈمن سے رابطہ کریں۔</p>
        </div>
      </div>
    );

    return (
        <StudentDetail 
          student={student} 
          reports={reports} 
          onBack={() => {}} 
          isAdmin={false}
          madrasaInfo={madrasaInfo}
        />
    );
}
