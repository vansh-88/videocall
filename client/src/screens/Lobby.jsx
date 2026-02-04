
import { useState , useCallback, useEffect} from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../context/SocketProvider'
import { FiMail, FiHash } from 'react-icons/fi'


const Lobby = () => {

  const [email, setEmail] = useState('')
  const [roomId, setRoomId] = useState('')

  const socket=useSocket();
  const navigate=useNavigate();

  const handleSubmitForm=useCallback(
    (e)=>{
      e.preventDefault();
      // persist email locally for use in subsequent pages
      try { localStorage.setItem('userEmail', email); } catch(e) {}
      socket.emit('join-room', {email, roomId});
    },
    [email, roomId, socket]
  );

  const handleJoinRoom = useCallback((data)=>{
    const {roomId, email}=data;
    navigate(`/room/${roomId}`);
  },[]);

  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');

  const handleRoomFull = useCallback((data)=>{
    setPopupMessage(`Room ${data.roomId} is full`);
    setShowPopup(true);
  },[]);

  useEffect(()=>{
    socket.on('join-room', handleJoinRoom);
    socket.on('room-full', handleRoomFull);

    return ()=>{
      socket.off('join-room', handleJoinRoom);
      socket.off('room-full', handleRoomFull);
    }
  },[socket, handleJoinRoom, handleRoomFull]);

  useEffect(()=>{
    if (!showPopup) return;
    const t = setTimeout(()=>setShowPopup(false), 4000);
    return ()=>clearTimeout(t);
  },[showPopup]);

  return (
    <div className="app-container">
      <div className="card transform transition hover:-translate-y-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-accent rounded-md text-primary">
            <FiMail size={20} />
          </div>
          <div>
            <h1 className="card-heading font-semibold">Join a Room</h1>
            <div className="card-subtitle small-muted">Enter your email and a room ID to join — share the room ID with others.</div>
          </div>
        </div>
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <div>
            <label htmlFor='email' className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400"><FiMail /></span>
              <input className="form-input pl-10" type="text" id="email" value={email} onChange={(e)=>setEmail(e.target.value)}/>
            </div>
          </div>
          <div>
            <label htmlFor='roomId' className="block text-sm font-medium text-slate-600 mb-1">Room ID</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400"><FiHash /></span>
              <input className="form-input pl-10" type="text" id="roomId" value={roomId} onChange={(e)=>setRoomId(e.target.value)}/>
            </div>
          </div>
          <div className="pt-2 w-full sm:w-auto">
            <button className="primary-btn inline-flex items-center gap-2 w-full sm:w-auto justify-center bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" type="submit">
              <span>Join Room</span>
            </button>
          </div>
        </form>
      </div>

      {showPopup && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white text-slate-800 px-4 py-2 rounded shadow-md flex items-center gap-3">
          <div>{popupMessage}</div>
          <button className="text-slate-500 text-sm" onClick={()=>setShowPopup(false)}>Close</button>
        </div>
      )}
    </div>
  )
}

export default Lobby