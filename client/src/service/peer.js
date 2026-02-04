class  PeerService {
    constructor() {
        if(!this.peer)
        this.peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: 'stun:stun.l.google.com:19302'       // to be set from env variable 
                }
            ]
        });

        this._transceiversSetup = false;
        this._pendingCandidates = [];
        this._lastLocalStream = null;

        // attach debug logging for tracks
        this.peer.addEventListener('track', (e) => {
            console.debug('[peer] track event, streams:', e.streams);
        });
    }

    ensureTransceivers(){
        if (!this.peer) return;
        try {
            const tx = this.peer.getTransceivers();
            const hasAudio = tx.some(t => t && t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') || tx.some(t => t && t.sender && t.sender.track && t.sender.track.kind === 'audio') || tx.some(t => t && t.kind === 'audio');
            const hasVideo = tx.some(t => t && t.receiver && t.receiver.track && t.receiver.track.kind === 'video') || tx.some(t => t && t.sender && t.sender.track && t.sender.track.kind === 'video') || tx.some(t => t && t.kind === 'video');
            if (!hasAudio) this.peer.addTransceiver('audio', { direction: 'sendrecv' });
            if (!hasVideo) this.peer.addTransceiver('video', { direction: 'sendrecv' });
            this._transceiversSetup = true;
        } catch(e){
            console.warn('ensureTransceivers failed', e);
        }
    }

    addLocalStream(stream){
        if (!this.peer || !stream) return;
        // remember the stream so we can retry builds when offer creation fails
        this._lastLocalStream = stream;
        // ensure transceivers exist to keep m-line order deterministic
        this.ensureTransceivers();
        const transceivers = this.peer.getTransceivers() || [];
        for (const track of stream.getTracks()){
            try {
                // find a transceiver matching the track's kind
                let trans = transceivers.find(t => t && t.kind === track.kind && t.sender);
                if (trans && trans.sender) {
                    try {
                        trans.sender.replaceTrack(track);
                    } catch (e) {
                        console.warn('transceiver.replaceTrack failed, falling back to sender.replaceTrack', e);
                        try { trans.sender.replaceTrack(track); } catch(e2){}
                    }
                } else {
                    // fallback: try to replace on any sender with same kind
                    const sender = this.peer.getSenders().find(s => (s.track && s.track.kind === track.kind));
                    if (sender) {
                        try { sender.replaceTrack(track); } catch(e) { console.warn('sender.replaceTrack fallback failed', e); }
                    } else {
                        // as a last resort add the track (may change m-line order if transceivers not set)
                        try { this.peer.addTrack(track, stream); } catch(e){ console.warn('addTrack fallback failed', e); }
                    }
                }
            } catch(e){
                console.warn('addLocalStream per-track failed', e);
                try { this.peer.addTrack(track, stream); } catch(e2){ console.warn('addLocalStream addTrack failed', e2); }
            }
        }
    }

    // set remote description (answer/offer from remote peer) and drain pending ICE candidates
    async setRemoteDescription(desc){
        if(this.peer){
            await this.peer.setRemoteDescription(desc);
            // drain any buffered ICE candidates that arrived before remote description was set
            if (this._pendingCandidates && this._pendingCandidates.length) {
                for (const c of this._pendingCandidates) {
                    try {
                        await this.peer.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) {
                        console.warn('[peer] addIceCandidate failed while draining buffer', e);
                    }
                }
                this._pendingCandidates = [];
            }
        }
    }

    // Add an ICE candidate safely (buffers if remoteDescription not set yet)
    async addIceCandidate(candidate){
        if (!candidate) return;
        if (!this.peer) return;
        try {
            if (this.peer.remoteDescription) {
                await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // buffer it for later
                this._pendingCandidates.push(candidate);
            }
        } catch(e){
            console.warn('[peer] addIceCandidate failed', e);
        }
    }

    async getAnswer(offer){
        if(this.peer){
            if (offer) {
                await this.peer.setRemoteDescription(offer);
            }
            const answer = await this.peer.createAnswer();
            await this.peer.setLocalDescription(answer);
            console.debug('[peer] created answer');
            return answer;
        }
    }  

    async getOffer(){
        if(this.peer){
            // ensure we have stable m-lines before creating offer
            this.ensureTransceivers();
            const offer = await this.peer.createOffer();
            try {
                await this.peer.setLocalDescription(offer);
            } catch (e) {
                console.debug('[peer] setLocalDescription failed on offer, retrying after ensureTransceivers', e);
                // try to ensure transceivers again and retry once
                try {
                    this.ensureTransceivers();
                    await this.peer.setLocalDescription(offer);
                } catch (e2) {
                    console.warn('[peer] setLocalDescription retry failed', e2);
                    throw e2;
                }
            }
            console.debug('[peer] created offer');
            return offer;
        }
    }

    closePeer(){
        if (this.peer) {
            try {
                // stop any local outgoing tracks attached to this RTCPeerConnection
                this.peer.getSenders().forEach(sender => {
                    try { if (sender.track) sender.track.stop(); } catch(e){}
                });
            } catch(e){}
            try { this.peer.close(); } catch(e){}
            // recreate a fresh peer for future calls
            this.peer = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: 'stun:stun.l.google.com:19302'
                    }
                ]
            });
            this._transceiversSetup = false;
            this._pendingCandidates = [];
            this.peer.addEventListener('track', (e) => {
                console.debug('[peer] track event, streams:', e.streams);
            });
        }
    }
}

export default new PeerService();