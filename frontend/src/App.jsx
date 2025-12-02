// import { useState } from "react";

// export default function App() {
//   const [lectureId, setLectureId] = useState("");   // ✅ объявляем состояние

//   const handleUpload = async (e) => {
//     e.preventDefault();
//     const file = e.target.file.files[0];
//     if (!file || !lectureId) {
//       alert("Введите ID лекции и выберите файл!");
//       return;
//     }

//     const fd = new FormData();
//     fd.append("file", file);

//     try {
//       const res = await fetch(`http://localhost:8000/api/upload/${lectureId}`, {
//         method: "POST",
//         body: fd,
//       });

//       if (!res.ok) {
//         throw new Error("Ошибка загрузки файла");
//       }

//       alert("Файл успешно загружен");
//     } catch (err) {
//       console.error(err);
//       alert("Ошибка при отправке файла");
//     }
//   };

//   return (
//     <div style={{ padding: 24, fontFamily: "sans-serif" }}>
//       <h1>Frontend работает ✅</h1>
//       <form onSubmit={handleUpload}>
//         <div style={{ marginBottom: 12 }}>
//           Lecture ID:{" "}
//           <input
//             value={lectureId}
//             onChange={(e) => setLectureId(e.target.value)}
//             placeholder="Введите ID лекции"
//           />
//         </div>
//         <input type="file" name="file" />
//         <button type="submit">Отправить</button>
//       </form>
//     </div>
//   );
// }
