import { useEffect, useCallback, useState , useRef, use} from 'react'
import { useSocket } from '../context/SocketProvider'
import peer from '../service/peer';

const RoomPage = () => {

    const socket = useSocket();
    const [remoteSocketId, setRemoteSocketId] = useState(null);
    const [myStream, setMyStream] = useState();
    const [remoteStream, setRemoteStream] = useState();

    const myVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

   // When someone joins the room
    const handleUserJoined = useCallback((data) => {
        setRemoteSocketId(data.socketId);
    }, []);

    // Start local camera
    const handleCallUser = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        const offer = await peer.getOffer();
        socket.emit('call-user', {to: remoteSocketId, offer});
        setMyStream(stream);
    }, [remoteSocketId, socket]);

    // When call is made by other user
    const handleCallMade = useCallback(async (data) => {
        setRemoteSocketId(data.socketId);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        setMyStream(stream);

        const answer = await peer.getAnswer(data.offer);
        socket.emit('make-answer', {
            to: data.socketId,
            answer
        }); 
    }, [socket]);

    const sendStreams = useCallback(() => {
        for (const track of myStream.getTracks()) {
            peer.peer.addTrack(track, myStream);
        }
    }, [myStream]);

    // Answer received from other user
    const handleAnswerMade = useCallback((data) => {
        peer.setLocalDescription(data.answer);
        sendStreams();
        
    }, [sendStreams]);

    const handleNegoincoming= useCallback(async (data) => {
        const answer = await peer.getAnswer(data.offer);
        socket.emit('peer-nego-done', {
            to: data.socketId,
            answer
        }); 
    }, [socket]);   

    const handleNegoFinal= useCallback(async (data) => {
        await peer.setLocalDescription(data.answer);
    }, []);

    const unmuteRemote = () => {
            remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
    };

    // Listen for new user
    useEffect(() => {
        socket.on('user-connected', handleUserJoined);
        socket.on('call-made', handleCallMade);
        socket.on('answer-made', handleAnswerMade);
        socket.on('peer-nego-needed', handleNegoincoming);
        socket.on('peer-nego-final', handleNegoFinal);

        return () => {
            socket.off('user-connected', handleUserJoined);
            socket.off('call-made', handleCallMade);
            socket.off('answer-made', handleAnswerMade);
            socket.off('peer-nego-needed', handleNegoincoming);
            socket.off('peer-nego-final', handleNegoFinal);
        };
    }, [socket, handleUserJoined, handleCallMade, handleAnswerMade, handleNegoincoming, handleNegoFinal]);   

    useEffect(() => {
        
        peer.peer.addEventListener('track', async (event) => {
            // const remoteStream = event.streams;
            setRemoteStream(event.streams[0]);
        });
        
    }, [peer.peer]);

    const handleNegoNeeded = useCallback(async () => {
        const offer = await peer.getOffer();
        socket.emit('peer-nego-needed', {to: remoteSocketId, offer});
    }, [remoteSocketId, socket]);   

    useEffect(() => {
        peer.peer.addEventListener('negotiationneeded', handleNegoNeeded);

        return () => {
            peer.peer.removeEventListener('negotiationneeded', handleNegoNeeded);
        };
    }, [handleNegoNeeded]);

    // Attach stream to <video>
    useEffect(() => {
        if (myVideoRef.current && myStream) {
            myVideoRef.current.srcObject = myStream;
        }
    }, [myStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    return (
        <div>
            <h1>Room Page</h1>
            <h3>
                {remoteSocketId ? "User Connected" : "Waiting for another user..."}
            </h3>
            {/* {myStream && <button onClick={sendStreams}>Send Stream</button>} */}
            {remoteSocketId && <button onClick={handleCallUser}>CALL</button>}
            {myStream && (
                <div>
                    <h3>My Stream</h3>
                    <video
                        ref={myVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: "200px", height: "120px", background: "#000" }}
                    ></video>

                    <button onClick={unmuteRemote}>Mute / Unmute</button>
                </div>
            )}
            {remoteStream && (
                <div>
                    <h3>Remote Stream</h3>
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: "200px", height: "120px", background: "#000" }}
                    ></video>

                    
                </div>
            )}
        </div>
    );
};


export default RoomPage