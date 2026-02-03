
import { useState , useCallback, useEffect} from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../context/SocketProvider'


const Lobby = () => {

  const [email, setEmail] = useState('')
  const [roomId, setRoomId] = useState('')

  const socket=useSocket();
  const navigate=useNavigate();

  const handleSubmitForm=useCallback(
    (e)=>{
      e.preventDefault();
      socket.emit('join-room', {email, roomId});
    },
    [email, roomId, socket]
  );

  const handleJoinRoom = useCallback((data)=>{
    const {roomId, email}=data;
    navigate(`/room/${roomId}`);
  },[]);

  useEffect(()=>{
    socket.on('join-room', handleJoinRoom);

    return ()=>{
      socket.off('join-room', handleJoinRoom);
    }
  },[socket, handleJoinRoom]);

  return (
    <div>
      <form onSubmit={handleSubmitForm}>
        <label htmlFor='email'> Enter email ID:</label>
        <input type="text" id="email" value={email} onChange={(e)=>setEmail(e.target.value)}/>
        <br />
        <label htmlFor='roomId'> Enter Room ID:</label>
        <input type="text" id="roomId" value={roomId} onChange={(e)=>setRoomId(e.target.value)}/>
        <br />
        <button type="submit">Join Room</button>
      </form>
    </div>
  )
}

export default Lobby