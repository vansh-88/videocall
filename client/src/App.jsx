import { Route, Routes} from 'react-router-dom'
import Lobby from './screens/Lobby'
import RoomPage from './screens/Room.jsx'

function App() {
  
    return <div>
      <Routes>
        <Route path='/' element={<Lobby/>} />
        <Route path='/room/:roomId' element={<RoomPage/>} />
      </Routes>
    </div>
}

export default App
