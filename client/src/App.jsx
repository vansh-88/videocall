import { Route, Routes} from 'react-router-dom'
import Lobby from './screens/Lobby'
import RoomPage from './screens/Room.jsx'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  
    return <div>
      <Routes>
        <Route path='/' element={<Lobby/>} />
        <Route path='/room/:roomId' element={<ErrorBoundary><RoomPage/></ErrorBoundary>} />
      </Routes>
    </div>
}

export default App
