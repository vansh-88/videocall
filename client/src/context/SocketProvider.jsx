import React, {createContext, useMemo, useContext} from 'react'
import io from 'socket.io-client';


const socketContext = createContext(null);

export const useSocket=()=>{
    const socket = useContext(socketContext);
    return socket;
}

export const SocketProvider = ({children}) => {

    const socket = useMemo(() => io('https://videocall-7hfb.onrender.com'), []);
    // const socket = useMemo(() => io('http://localhost:3000'), []);


  return (
    <socketContext.Provider value={socket}>
      {children}
    </socketContext.Provider>
  )
}

export default socketContext;   