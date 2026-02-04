import { useEffect, useCallback, useState , useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useSocket } from '../context/SocketProvider'
import peer from '../service/peer';
import { FiPhone, FiMic, FiMicOff } from 'react-icons/fi' 

const RoomPage = () => {

    const socket = useSocket();
    const { roomId } = useParams();
    const [remoteSocketId, setRemoteSocketId] = useState(null);
    const [myStream, setMyStream] = useState();
    const [remoteStream, setRemoteStream] = useState();
    const [incomingCall, setIncomingCall] = useState(null);
    const [inCall, setInCall] = useState(false);
    const [popupMessage, setPopupMessage] = useState('');
    const [showPopup, setShowPopup] = useState(false);

    const myVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

   // When someone joins the room
    const handleUserJoined = useCallback((data) => {
        setRemoteSocketId(data.socketId);
    }, []);

    // Attach an ICE candidate handler that forwards gathered candidates to the given target
    const attachIceHandler = useCallback((targetSocketId) => {
        if (!peer || !peer.peer) return;
        peer.peer.onicecandidate = (event) => {
            if (event && event.candidate && targetSocketId && socket) {
                console.log('Sending ICE candidate to', targetSocketId);
                socket.emit('ice-candidate', { to: targetSocketId, candidate: event.candidate });
            }
        };
    }, [socket]);

    const negotiatingRef = useRef(false);

    // Start local camera (initiate call)
    const handleCallUser = useCallback(async () => {
        if (negotiatingRef.current) return;
        negotiatingRef.current = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            // set local preview first
            setMyStream(stream);
            // add local tracks to peer before creating offer so they're included
            try { peer.addLocalStream(stream); } catch(e){ console.warn('addLocalStream failed', e); }
            // attach ICE candidate handler early so candidates are emitted during createOffer/setLocalDescription
            attachIceHandler(remoteSocketId);
            let offer;
            try {
                offer = await peer.getOffer();
            } catch (e) {
                console.warn('getOffer failed, attempting to reset peer and retry', e);
                try { peer.closePeer(); } catch(e2){}
                // wait briefly then re-add local stream and retry
                await new Promise(r => setTimeout(r, 200));
                try { peer.ensureTransceivers(); peer.addLocalStream(stream); } catch(e3) { console.warn('retry prep failed', e3); }
                try {
                    attachIceHandler(remoteSocketId);
                    offer = await peer.getOffer();
                } catch(e4) {
                    console.error('Retry getOffer failed', e4);
                    setPopupMessage('Failed to start call — please try again.');
                    setShowPopup(true);
                    return;
                }
            }
            console.log('Emitting call-user to', remoteSocketId, 'from', socket?.id);
            socket.emit('call-user', { to: remoteSocketId, offer });
        } catch (err) {
            console.error('Failed to start call:', err);
            setPopupMessage('Could not access camera/microphone or start call.');
            setShowPopup(true);
        } finally {
            negotiatingRef.current = false;
        }
    }, [remoteSocketId, socket, attachIceHandler]);

    // When call is made by other user => incoming call; ask user to accept
    const handleCallMade = useCallback((data) => {
        console.log('Received call-made', data);
        // show incoming call UI; do not auto-answer
        setRemoteSocketId(data.socketId);
        setIncomingCall({ socketId: data.socketId, offer: data.offer, email: data.email });
    }, []);


    const sendStreams = useCallback(() => {
        if (!myStream) return;
        try { peer.addLocalStream(myStream); } catch(e){ console.warn('sendStreams addLocalStream failed', e); }
    }, [myStream]);

    // Answer received from other user
    const handleAnswerMade = useCallback(async (data) => {
        // set remote description (answer) on caller
        console.log('Received answer from', data.socketId);
        // ensure ICE handler is attached for the caller as well
        attachIceHandler(data.socketId);
        await peer.setRemoteDescription(data.answer);
        sendStreams();
        setInCall(true);
    }, [sendStreams, attachIceHandler]);

    const handleNegoincoming= useCallback(async (data) => {
        // attach ICE handler for this negotiation and create answer
        attachIceHandler(data.socketId);
        const answer = await peer.getAnswer(data.offer);
        socket.emit('peer-nego-done', {
            to: data.socketId,
            answer
        }); 
    }, [socket, attachIceHandler]);   

    const handleNegoFinal= useCallback(async (data) => {
        await peer.setRemoteDescription(data.answer);
    }, []);

    // When joining a room, server may return existing members for the joining socket
    const handleRoomMembers = useCallback((data) => {
        const { members } = data || {};
        if (members && members.length > 0) {
            // we only support up to 2 people; pick the first existing member as remote
            setRemoteSocketId(members[0].socketId);
        }
    }, []);

    const [mutedLocal, setMutedLocal] = useState(true);
    const [mutedRemote, setMutedRemote] = useState(true);

    const unmuteRemote = () => {
        if (!remoteVideoRef.current) return;
        remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
        setMutedRemote(remoteVideoRef.current.muted);
    };

    const unmuteMe = () => {
        if (!myVideoRef.current) return;
        myVideoRef.current.muted = !myVideoRef.current.muted;
        setMutedLocal(myVideoRef.current.muted);
    }

    const acceptCall = useCallback(async () => {
        if (!incomingCall) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setMyStream(stream);
            // set remote offer first so m-line order is known, then ensure transceivers and attach local streams to match
            await peer.setRemoteDescription(incomingCall.offer);
            try { peer.ensureTransceivers(); } catch(e){}
            try { peer.addLocalStream(stream); } catch(e){ console.warn('addLocalStream failed', e); }
            // attach ICE handler early so candidate exchange starts while answer is created
            attachIceHandler(incomingCall.socketId);
            let answer;
            try {
                answer = await peer.getAnswer(incomingCall.offer);
            } catch (e) {
                console.warn('getAnswer failed, attempting to reset peer and retry', e);
                try { peer.closePeer(); } catch(e2){}
                await new Promise(r => setTimeout(r, 200));
                try { await peer.setRemoteDescription(incomingCall.offer); peer.ensureTransceivers(); peer.addLocalStream(stream); } catch(e3){ console.warn('retry prep failed', e3); }
                try { attachIceHandler(incomingCall.socketId); answer = await peer.getAnswer(incomingCall.offer); } catch(e4) {
                    console.error('Retry getAnswer failed', e4);
                    setPopupMessage('Failed to accept call — please try again.');
                    setShowPopup(true);
                    setIncomingCall(null);
                    return;
                }
            }
            console.log('Sending make-answer to', incomingCall.socketId);
            socket.emit('make-answer', { to: incomingCall.socketId, answer });
            setInCall(true);
            setIncomingCall(null);
        } catch (err) {
            console.error('Failed to accept call', err);
            alert('Could not access camera/microphone.');
            if (socket && incomingCall?.socketId) socket.emit('hang-up', { to: incomingCall.socketId });
            setIncomingCall(null);
        }
    }, [incomingCall, socket, attachIceHandler]);

    const declineCall = useCallback(() => {
        if (socket && incomingCall?.socketId) socket.emit('hang-up', { to: incomingCall.socketId });
        setIncomingCall(null);
    }, [incomingCall, socket]);

    // manual disconnect/hangup
    const handleDisconnect = useCallback(() => {
        // stop local tracks
        if (myStream) {
            try {
                for (const t of myStream.getTracks()) t.stop();
            } catch(e){}
            setMyStream(null);
        }

        // clear remote stream UI
        setRemoteStream(null);

        // notify remote peer
        if (socket && typeof socket.emit === 'function' && remoteSocketId) {
            socket.emit('hang-up', { to: remoteSocketId });
        }

        // close and recreate peer connection
        try { peer.closePeer(); } catch(e){}

        setRemoteSocketId(null);
        setInCall(false);
    }, [myStream, socket, remoteSocketId]);

    const handlePeerHangup = useCallback((data) => {
        // remote hung up / declined — clear UI and stop local tracks
        if (myStream) {
            try { for (const t of myStream.getTracks()) t.stop(); } catch(e){}
            setMyStream(null);
        }
        setRemoteStream(null);
        setRemoteSocketId(null);
        setInCall(false);

        // give user feedback via popup
        setPopupMessage('Call ended by the other user.');
        setShowPopup(true);
    }, [myStream]);

    // Listen for new user
    useEffect(() => {
        socket.on('user-connected', handleUserJoined);
        socket.on('call-made', handleCallMade);
        socket.on('answer-made', handleAnswerMade);
        socket.on('peer-nego-needed', handleNegoincoming);
        socket.on('peer-nego-final', handleNegoFinal);
        socket.on('peer-hangup', handlePeerHangup);
        socket.on('room-members', handleRoomMembers);

        return () => {
            socket.off('user-connected', handleUserJoined);
            socket.off('call-made', handleCallMade);
            socket.off('answer-made', handleAnswerMade);
            socket.off('peer-nego-needed', handleNegoincoming);
            socket.off('peer-nego-final', handleNegoFinal);
            socket.off('peer-hangup', handlePeerHangup);
            socket.off('room-members', handleRoomMembers);
        };
    }, [socket, handleUserJoined, handleCallMade, handleAnswerMade, handleNegoincoming, handleNegoFinal, handlePeerHangup]);   

    const handleUserDisconnected = useCallback((data) => {
        const { socketId } = data || {};
        if (socketId && socketId === remoteSocketId) {
            setRemoteSocketId(null);
            setInCall(false);
            setPopupMessage('Other user left the room.');
            setShowPopup(true);
        }
    }, [remoteSocketId]);

    // Request members on mount to avoid race where server emitted room-members before we registered listener
    useEffect(() => {
        if (!socket || !roomId) return;
        socket.emit('request-room-members', { roomId });
        socket.on('user-disconnected', handleUserDisconnected);
        return () => {
            socket.off('user-disconnected', handleUserDisconnected);
        };
    }, [socket, roomId, handleUserDisconnected]);

    useEffect(() => {
        const onTrack = (event) => {
            console.debug('[Room] track event, streams:', event.streams);
            setRemoteStream(event.streams[0]);
        };
        peer.peer.addEventListener('track', onTrack);
        return () => {
            try { peer.peer.removeEventListener('track', onTrack); } catch(e){}
        };
    }, [peer.peer]);

    const handleNegoNeeded = useCallback(async () => {
        if (negotiatingRef.current) return;
        negotiatingRef.current = true;
        try {
            const offer = await peer.getOffer();
            attachIceHandler(remoteSocketId);
            socket.emit('peer-nego-needed', {to: remoteSocketId, offer});
        } catch (e) {
            console.warn('handleNegoNeeded failed', e);
            setPopupMessage('Could not renegotiate the call. Please try again.');
            setShowPopup(true);
        } finally {
            negotiatingRef.current = false;
        }
    }, [remoteSocketId, socket, attachIceHandler]);   

    // Receive ICE candidates from remote and add them to our peer
    useEffect(() => {
        const handleRemoteIce = (data) => {
            try {
                if (data?.candidate) {
                    console.log('Received remote ICE candidate from', data.socketId);
                    peer.addIceCandidate(data.candidate);
                }
            } catch (e) {
                console.warn('addIceCandidate failed', e);
            }
        };
        socket.on('ice-candidate', handleRemoteIce);
        return () => socket.off('ice-candidate', handleRemoteIce);
    }, [socket]);
    useEffect(() => {
        peer.peer.addEventListener('negotiationneeded', handleNegoNeeded);

        // connection state logging to assist debugging
        const onState = () => {
            console.log('[peer] connectionState', peer.peer.connectionState);
            if (peer.peer.connectionState === 'connected' || peer.peer.connectionState === 'completed') {
                setInCall(true);
            }
            if (['disconnected','failed','closed'].includes(peer.peer.connectionState)) {
                setInCall(false);
            }
        };
        peer.peer.addEventListener('connectionstatechange', onState);

        // global unhandled rejection handler to surface tidy errors
        const onUnhandledRejection = (ev) => {
            console.warn('Unhandled promise rejection:', ev.reason);
            setPopupMessage('An unexpected error occurred. See console for details.');
            setShowPopup(true);
            try { ev.preventDefault(); } catch(e){}
        };
        window.addEventListener('unhandledrejection', onUnhandledRejection);

        return () => {
            peer.peer.removeEventListener('negotiationneeded', handleNegoNeeded);
            try { peer.peer.removeEventListener('connectionstatechange', onState); } catch(e){}
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
        };
    }, [handleNegoNeeded]);

    useEffect(() => {
        if (!showPopup) return;
        const t = setTimeout(() => setShowPopup(false), 4000);
        return () => clearTimeout(t);
    }, [showPopup]);


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
        <div className="app-container">
            <div className="card">
                <div className="mb-2 text-xs text-slate-500">
                    <div>Your socket: <span className="font-mono text-sm">{socket?.id || '—'}</span> &nbsp; Remote socket: <span className="font-mono text-sm">{remoteSocketId || '—'}</span></div>
                    {incomingCall && <div className="text-sm text-primary mt-1">Incoming from: {incomingCall.email || incomingCall.socketId}</div>}
                </div>

                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-semibold">Room</h1>
                    <span className="small-muted">{remoteSocketId ? 'User Connected' : 'Waiting for another user...'}</span>
                </div>

                <div className="mb-4 flex flex-col sm:flex-row items-center gap-2">
                    {incomingCall ? (
                        <div className="w-full flex flex-col sm:flex-row items-center justify-between bg-white p-3 rounded-md">
                            <div>
                                <div className="font-medium">Incoming call</div>
                                <div className="small-muted text-sm">From {incomingCall.email || incomingCall.socketId}</div>
                            </div>
                            <div className="flex gap-2 mt-3 sm:mt-0 sm:flex-row flex-col w-full sm:w-auto">
                                <button className="primary-btn w-full sm:w-auto bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" onClick={acceptCall}>Accept</button>
                                <button className="secondary-btn w-full sm:w-auto bg-white border border-indigo-200 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-100" onClick={declineCall}>Decline</button>
                            </div>
                        </div>
                    ) : (
                        remoteSocketId && !inCall && (
                            <button className="primary-btn inline-flex items-center gap-2 w-full sm:w-auto justify-center" onClick={handleCallUser}>
                                <FiPhone />
                                <span>Call</span>
                            </button>
                        )
                    )}

                    {inCall && (
                        <button className="secondary-btn bg-white border border-indigo-200 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-100" onClick={handleDisconnect}>Disconnect</button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-black rounded-md overflow-hidden h-40 sm:h-52 md:h-64 flex items-center justify-center relative">
                        {myStream ? (
                            <>
                                <video ref={myVideoRef} autoPlay muted={mutedLocal} playsInline className="w-full h-full object-cover" />
                                <button onClick={unmuteMe} className="absolute bottom-3 right-3 bg-white/20 p-3 sm:p-2 rounded-full backdrop-blur-sm hover:scale-105 transition">
                                    {mutedLocal ? <FiMicOff className="text-white"/> : <FiMic className="text-white" />}
                                </button>
                            </>
                        ) : (
                            <div className="text-white text-sm">No local stream</div>
                        )}
                    </div>

                    <div className="bg-black rounded-md overflow-hidden h-40 sm:h-52 md:h-64 flex items-center justify-center relative">
                        {remoteStream ? (
                            <>
                                <video ref={remoteVideoRef} autoPlay muted={mutedRemote} playsInline className="w-full h-full object-cover" />
                                <button onClick={unmuteRemote} className="absolute bottom-3 right-3 bg-white/20 p-3 sm:p-2 rounded-full backdrop-blur-sm hover:scale-105 transition">
                                    {mutedRemote ? <FiMicOff className="text-white"/> : <FiMic className="text-white" />}
                                </button>
                            </>
                        ) : (
                            <div className="text-white text-sm">No remote stream</div>
                        )}
                    </div>
                </div>

            </div>

            {showPopup && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white text-slate-800 px-4 py-2 rounded shadow-md flex items-center gap-3">
                    <div>{popupMessage}</div>
                    <button className="text-slate-500 text-sm" onClick={() => setShowPopup(false)}>Close</button>
                </div>
            )}
        </div>
    );
};


export default RoomPage