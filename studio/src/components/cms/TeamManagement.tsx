import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { api, type CmsUser } from '../../lib/cms';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { CmsField, CmsLoading, CmsNotice, errorMessage, shortDate } from './shared';

export function TeamManagement({ user }: { user: CmsUser }) {
  const [users, setUsers] = useState<CmsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'create' | 'password' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await api<{ users: CmsUser[] }>('/users'); setUsers(result.users); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  function open(next: 'create' | 'password') { setName(''); setEmail(''); setPassword(''); setCurrentPassword(''); setFormError(''); setModal(next); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFormError('');
    try {
      if (modal === 'create') { await api('/users', { method: 'POST', body: { name: name.trim(), email: email.trim(), password } }); setMessage('管理员账号已创建。请自行将登录地址和初始密码告知对方，系统不会发送邮件。'); await refresh(); }
      else { await api('/auth/password', { method: 'POST', body: { currentPassword, password } }); setMessage('你的登录密码已更新。'); }
      setModal(null); setPassword(''); setCurrentPassword('');
    } catch (cause) { setFormError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <section>
    <div className="cms-section-heading"><div><span className="cms-eyebrow">PEOPLE BEHIND THE PAGES</span><h1>和团队一起，让网站生长。</h1><p>每位管理员拥有独立账号，共同编辑和发布这个网站的页面。</p></div><div className="cms-heading-actions"><Button variant="outline" onPress={() => open('password')}><KeyRound size={15} />修改我的密码</Button><Button onPress={() => open('create')}><Plus size={16} />添加管理员</Button></div></div>
    <div className="cms-team-note"><ShieldCheck size={22} /><div><strong>共享网站，独立身份</strong><p>所有管理员都可以编辑页面、发布内容、调整全站主题和添加管理员。页面更新会记录最后修改人。</p></div></div>
    {error && <CmsNotice error>{error}<Button variant="link" size="sm" onPress={() => void refresh()}>重试</Button></CmsNotice>}
    {message && <CmsNotice>{message}</CmsNotice>}
    <div className="cms-page-box"><div className="cms-box-heading"><h2>网站管理员</h2><span>{users.length} 位成员</span></div>{loading ? <CmsLoading /> : <div className="cms-team-grid">{users.map(member => <article className="cms-team-card" key={member.id}><div className="cms-member-avatar">{member.name.slice(0, 1).toUpperCase() || <UserRound size={22} />}</div><div><h3>{member.name}{member.id === user.id && <span>你</span>}</h3><p>{member.email}</p><small>加入于 {shortDate(member.createdAt)}</small></div><span className="cms-role-badge"><ShieldCheck size={12} />管理员</span></article>)}</div>}</div>
    <Dialog isOpen={modal !== null} onOpenChange={openState => { if (!openState && !busy) { setModal(null); setPassword(''); setCurrentPassword(''); } }}><DialogContent className="cms-dialog"><DialogHeader><DialogTitle>{modal === 'create' ? '添加网站管理员' : '修改我的密码'}</DialogTitle><DialogDescription>{modal === 'create' ? '新管理员可共同管理这个网站。创建后，请自行将初始密码告知对方。' : '使用当前密码确认身份，再设置新的登录密码。'}</DialogDescription></DialogHeader><form onSubmit={event => void submit(event)} className="cms-form">{modal === 'create' ? <><CmsField label="姓名" value={name} onChange={setName} maxLength={80} autoComplete="off" /><CmsField label="邮箱" type="email" value={email} onChange={setEmail} maxLength={254} autoComplete="off" /></> : <CmsField label="当前密码" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />}<CmsField label={modal === 'create' ? '初始密码' : '新密码'} type="password" value={password} onChange={setPassword} minLength={12} maxLength={128} autoComplete="new-password" hint={modal === 'create' ? '使用至少 12 个字符。对方登录后可以修改自己的密码。' : '使用 12–128 个字符，建议组合多个不常见的词语。'} />{formError && <CmsNotice error>{formError}</CmsNotice>}<div className="cms-dialog-actions"><Button variant="outline" onPress={() => { setModal(null); setPassword(''); setCurrentPassword(''); }} isDisabled={busy}>取消</Button><Button type="submit" isDisabled={busy}>{busy ? '保存中…' : modal === 'create' ? '创建管理员' : '更新密码'}</Button></div></form></DialogContent></Dialog>
  </section>;
}
