import Header from './components/Header'
import UploadIntro from './components/UploadIntro'
import PdfUpload from './components/PdfUpload'
import './App.css'

export default function App() {
  return (
    <>
      <Header />
      <main className="page-content">
        <UploadIntro />
        <PdfUpload />
      </main>
    </>
  )
}