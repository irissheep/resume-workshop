import { newResume, newEducation, newExperience, newAward, newSkill, uid, type Resume } from './schema';
export function sampleResume(): Resume {
  const r = newResume('虚构示例 · 前端开发实习'); r.fictional = true;
  r.basics = { name: '林知夏（虚构）', phone: '13800000000', email: 'demo@example.com', city: '杭州', website: 'https://example.com/portfolio', photo: null };
  r.target.role = '前端开发实习生';
  r.summary = '计算机专业在读，具备 Vue、TypeScript 与数据库项目实践。关注清晰的交互和稳定的功能实现，希望在团队协作中积累前端工程经验。';
  const education = newEducation();
  Object.assign(education, { school: '示例科技大学（虚构）', degree: '本科', major: '计算机科学与技术', start: '2023-09', end: '2027-06', current: true, gpa: '3.8', gpaMax: '4.0', courses: '数据结构、数据库系统、计算机网络' });
  r.education.push(education);
  const project = newExperience('project');
  Object.assign(project, { name: '校园二手交易平台', organization: '课程项目', start: '2025-03', end: '2025-06', role: '前端开发', tools: 'Vue · TypeScript · MySQL', keywords: '校园二手交易平台，Vue、MySQL，负责登录和商品发布', facts: '本人负责登录页面和商品发布表单，与组员共同联调接口。', bullets: [
    { id: uid(), text: '参与校园二手交易平台开发，负责用户登录与商品发布功能，使用 Vue 和 MySQL 完成相关功能实现。' },
    { id: uid(), text: '与组员协作联调接口，完成表单校验与异常状态提示。' }
  ] });
  r.experiences.push(project);
  const campus = newExperience('campus');
  Object.assign(campus, { name: '学院技术分享活动', organization: '计算机协会（虚构）', start: '2024-10', end: '2025-05', role: '活动成员', keywords: '参与活动组织，整理讲座资料', bullets: [{ id: uid(), text: '参与技术分享活动的组织与资料整理，协助完成活动通知和现场支持。' }] });
  r.experiences.push(campus);
  r.awards = [Object.assign(newAward(), { name: '课程项目展示一等奖（虚构）', organization: '示例科技大学', date: '2025-06', level: '院级' })];
  r.skills = [
    Object.assign(newSkill(), { name: 'Vue / TypeScript', category: '前端开发', detail: '有课程项目实践，能完成页面与表单功能' }),
    Object.assign(newSkill(), { name: 'Git / MySQL', category: '开发工具', detail: '能够使用版本管理和基础数据库查询' })
  ];
  return r;
}
export function sparseResume(): Resume {
  const r = newResume('虚构测试 · 稀疏信息'); r.fictional = true;
  r.basics.name = '陈小禾（虚构）'; r.basics.email = 'sparse@example.com';
  const e = newExperience('campus'); e.name = '比赛'; e.keywords = '参加比赛，获得一等奖'; r.experiences = [e]; return r;
}
export function longResume(): Resume {
  const r = sampleResume(); r.name = '虚构测试 · 多页混排';
  r.basics.website = 'https://example.com/portfolio/' + 'LongEnglishLinkAndNumbers2026'.repeat(12);
  r.basics.photo = { name: '虚构占位照片.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAACWCAIAAACaSNt3AAACz0lEQVR4nO2dMXLcMAxF5Z0cMH1qngp1+tzKXc6Qzt0WzhAPAPle6xkTePsH0mpF6ePz7+cj+byANUTRHCYaQtEQioZQNISiIRQNoWgIRUMoGkLREIqGUDSEoiEUDaFoCEVDKBpC0RCKhlA0hKIhFA3x4xlC/Pn97k/r56+nPR/N71SK935nGe8rOr6juL/ujqLjfxV31v060vKz7/8cmOjIUdMk2l0SHWkBbBLtFqIj2UUH1y1E30C96EDiVh7qYtEB9l/ruj7Rl1ApOvCIFYbaRJ8uOorCVbWuiYZQ9NGio/RMq2R1Ew2haAhFQygaQtEQioZQNISijxa9Sn8wLVndREMo+nTRq2h6VK1roi8QvfBwFR6ETfQdohcYsdpzyvpEL6T/8lsd60VfQgvRKzlu5XHuIvrJdNHBcq8b0bf/ctpEca9Eb7fTynLHRH/hriyUcJ8hTLhzVkYeDE9F0RCKhuj+GInwrKOJ3Hf4heXSveD13wyDui386gv/cc2GzrJER13bF92pFPftYaETHdWb36ui/brW8sPW87rWMlzV62bLZG2vyy1jFaaL7m+ZqTNX9BTLQLVeJoVIFD0rztk1Z4meaDm1ckcHRIrouXHOq3+/6OmWk7pwdEAoeqboM+ZGRi8mGkLRA0WfNDe2d2SiIRQNoehpos8b0Hv7MtEQioZQNISiIRQNoWgIRUMoGkLREIqGUDSEoiEUPU10k32T29nVl4mGUDSEogeKPm9Mr30dmWgIRc8UfdL0WFt7MdEQih4r+ozpsXZ3kZLo6a5XQv2ODogs0XNDvXIqT0z0RNcrrWZHB0Su6FmhXpnVpid6iuuVXCcxOlZ710CF0IxejV0ztXEHw9XSNVYVetaxmrkm66l5NmlUb3jhP3JfV33H86ODjfa9r0Jd17yhs/6J6F/46Hma8GUKPOHrQeRbeJkUQtEQioZQNISiH4Z/UxcAl9v2WKgAAAAASUVORK5CYII=' };
  for (let i = 0; i < 12; i++) {
    const e = newExperience(i % 2 ? 'work' : 'project'); e.name = '虚构长经历 ' + (i + 1);
    e.start = '2024-01'; e.end = '2025-01'; e.role = '参与开发';
    e.keywords = '整理需求，使用 TypeScript 和 Vue 完成页面与表单。';
    e.bullets = Array.from({ length: 6 }, (_, j) => ({ id: uid(), text: '条目 ' + (i + 1) + '-' + (j + 1) + '：参与需求讨论和页面开发，使用 TypeScript、Vue 与 MySQL 完成相关功能，与团队协作进行接口联调。'.repeat(2) }));
    r.experiences.push(e);
  }
  const veryLong = newExperience('project'); veryLong.name = '超长条目续页检查';
  veryLong.bullets = [{ id: uid(), text: '连续长文本：这是虚构排版验证数据，检查中文与英文 TypeScript 混排以及超过一页的描述是否完整续页。'.repeat(140) }];
  r.experiences.push(veryLong); return r;
}

