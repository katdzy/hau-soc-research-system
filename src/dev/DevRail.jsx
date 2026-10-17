import { NavLink } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { splitPersonas } from './personas.js'
import ResetControls from './ResetControls.jsx'
import './dev.css'

/** Dev-only block at the foot of the navigation rail: persona switcher, reset / checkpoint, tools link. */
export default function DevRail() {
  const { snap, me, signIn } = useApp()
  return (
    <div className="dev-switch mb-2">
      <label className="label" htmlFor="dev-persona">Switch persona <span className="dev-flag">dev</span></label>
      <select id="dev-persona" value={me.id} onChange={e => signIn(e.target.value)}>
        {Object.entries(splitPersonas(snap.users ?? [])).map(([group, list]) => (
          <optgroup key={group} label={group === 'personas' ? 'Test personas (§6)' : 'NPC accounts'}>
            {list.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}{u.npc && u.block ? ` — ${u.block}` : u.globalRoles?.length ? ` — ${u.globalRoles.join(', ')}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ResetControls compact />
      <NavLink to="/dev" className="small">Dev tools</NavLink>
    </div>
  )
}
