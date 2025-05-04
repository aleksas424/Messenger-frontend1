import { useState, useEffect } from 'react';
import axios from 'axios';

export default function CreateGroupOrChannelModal({ type, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [admins, setAdmins] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/users')
      .then(res => setUsers(res.data));
  }, []);

  const toggleUser = (id) => {
    setSelected(sel => sel.includes(id) ? sel.filter(i => i !== id) : [...sel, id]);
    if (!selected.includes(id)) setAdmins(admins => admins.filter(a => a !== id));
  };
  const toggleAdmin = (id) => {
    setAdmins(adm => adm.includes(id) ? adm.filter(i => i !== id) : [...adm, id]);
  };

  const handleCreate = async () => {
    await axios.post(
      'http://localhost:5000/api/group',
      { name, type, description, members: selected, admins }
    );
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Sukurti {{ group: 'grupę', channel: 'kanalą' }[type]}</h3>
        <input
          className="w-full mb-2 px-3 py-2 border rounded"
          placeholder="Pavadinimas"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="w-full mb-4 px-3 py-2 border rounded"
          placeholder="Aprašymas (nebūtina)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="mb-4 max-h-48 overflow-y-auto">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-2 mb-1">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleUser(u.id)} />
              <span>{u.name}</span>
              {selected.includes(u.id) && (
                <label className="ml-2">
                  <input type="checkbox" checked={admins.includes(u.id)} onChange={() => toggleAdmin(u.id)} />
                  <span className="ml-1 text-xs">Admin</span>
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button className="bg-primary-500 text-white px-4 py-2 rounded" onClick={handleCreate}>Sukurti</button>
          <button className="bg-gray-300 px-4 py-2 rounded" onClick={onClose}>Atšaukti</button>
        </div>
      </div>
    </div>
  );
} 