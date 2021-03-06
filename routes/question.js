/**
 * Created by su on 2017/10/12.
 */
//静态资源的对象
const mapping = require('../static');
const setting = require('../setting');
const validator = require('validator');
const _ = require('lodash');
//引入问题表
const Question = require('../model/Question');
//引入用户表
const User = require('../model/User');
//引入reply表
const Reply = require('../model/Reply');
const Comment = require('../model/Comment');
//引入at模块
const at = require('../common/at');
//新建问题的处理函数
exports.create = (req, res, next) => {
    let user = req.session.user._id;
    Question.getOtherQuestionsId(user,(err,questionsi)=>{
        res.render('create', {
            title: '发布',
            questionsi:questionsi,
            layout: 'indexTemplate',
            resource: mapping.create,
            categorys: setting.categorys
        })
    })

}
//新建行为的处理函数
exports.postCreate = (req, res, next) => {
    let title = validator.trim(req.body.title);
    let category = validator.trim(req.body.category);
    let content = validator.trim(req.body.content);
    let error;
    if(!validator.isLength(title, {min: 8, max: 30})) {
        error = '标题长度不合法, 请重新输入';
    }
    if(!validator.isLength(content, {min: 10})) {
        error = '问题长度不合法, 请重新输入';
    }
    if(error) {
        return res.end(error);
    }
    else {
        //验证成功后
        req.body.author = req.session.user._id;
        let newQuestion = new Question(req.body);
        newQuestion.save().then(question => {
            //发布一篇文章, 积分+5, 发布数量+1
            User.getUserById(req.session.user._id, (err, user) => {
                if(err) {
                    return res.end(err);
                }
                user.score += 5;
                user.article_count += 1;
                user.save();
                req.session.user = user;
                //返回的是一个添加问题的页面地址
                res.json({url: `/question/${question._id}`})
            })
            //发送at消息
            at.sendMessageToMentionUsers(content, question._id, req.session.user._id, (err, msg) => {
                //console.log(msg);
            });
        }).catch(err => {
            return res.end(err);
        })
    }
}
//编辑问题的处理函数
exports.edit = (req, res, next) => {
    let question_id = req.params.id;
    Question.getQuestionById(question_id, (err, question) => {
        res.render('edit', {
            title: '编辑',
            layout: 'indexTemplate',
            resource: mapping.edit,
            categorys: setting.categorys,
            question: question
         })
    })
}
//编辑行为的处理函数
exports.postEdit = (req, res, next) => {
    let question_id = req.params.id;
    let title = validator.trim(req.body.title);
    let category = validator.trim(req.body.category);
    let content = validator.trim(req.body.content);
    let error;
    if(!validator.isLength(title, {min: 8, max: 30})) {
        error = '标题长度不合法, 请重新输入';
    }
    if(!validator.isLength(content, {min: 10})) {
        error = '问题长度不合法, 请重新输入';
    }
    if(error) {
        return res.end(error);
    }
    else {
        //验证成功后
        Question.getQuestionById(question_id, (err, question) => {
            if(err) {
                return res.end(err);
            }
            question.category = category;
            question.title = title;
            question.content = content;
            question.update_time = new Date();
            question.save();
        })
        //发送at消息
        at.sendMessageToMentionUsers(content, question_id, req.session.user._id, (err, msg) => {
            //console.log(msg);
        });
        res.json({url: `/question/${question_id}`});
    }
}
//删除行为的处理函数
exports.delete = (req, res, next) => {
    let question_id = req.params.id;
    let user = req.session.user._id;
    Question.getQuestionById(question_id, (err, question) => {
        if(err) {
            return res.end(err);
        }
        if(question.author._id == user) {
            //更改Question表deleted字段
            question.deleted = true;
            question.save();
            //更改User表的回复数和发布文章数
            question.author.reply_count -= question.comment_num;
            question.author.article_count -= 1;
            question.author.save();
            return res.end('success');
        }
        else {
            return res.end('err');
        }
    })
}
//查询问题的处理函数
exports.index = (req, res, next) => {
    //问题的ID
    let question_id = req.params.id;
    //当前登录的用户
    let currentUser = req.session.user;
    console.log(currentUser)
    //1.问题的信息
    //2.问题的回复信息
    //3.问题作者的其他相关文章推荐
    Question.getFullQuestion(question_id, (err, question) => {
        if(err) {
            return res.end(err);
        }
        if(question == null) {
            return res.render('error', {
                title: '问题详情',
                layout: 'indexTemplate',
                resource: mapping.question,
                message: '该问题不存在或者已经被删除',
                error: ''
            })
        }
        //问题的内容如果有@用户, 给@用户添加一个连接
        question.content = at.linkUsers(question.content);
        //问题的访问量+1
        question.click_num += 1;
        question.save();
        //来获取文章对应的所有的回复
        //reply表
        Reply.getFiveRepliesByQuestionId(question_id, (err, replies) => {
            if(replies.length > 0) {
                replies.forEach((reply, index) => {
                    reply.content = at.linkUsers(reply.content);
                })
            }
            Question.getOtherQuestions(question.author._id, question._id, (err, questions) => {
                let msg = null;
                if(currentUser) {
                    User.getUserById(currentUser._id, (err, user) => {
                        if (_.includes(user.followQuestion, question_id) == true) {
                            msg = 'follow';
                        }
                        else {
                            msg = 'unfollow';
                        }
                        return res.render('question', {
                            title: '问题详情',
                            layout: 'indexTemplate',
                            resource: mapping.question,
                            question: question,
                            others: questions,
                            replies: replies,
                            msg: msg
                        })
                    })
                }
                else {
                    return res.render('question', {
                        title: '问题详情',
                        layout: 'indexTemplate',
                        resource: mapping.question,
                        question: question,
                        others: questions,
                        replies: replies,
                        msg: msg
                    })
                }
            })
        })
    })
}
exports.show = (req, res, next) => {
    let question_id = req.params.id;
    Reply.getRepliesByQuestionId(question_id, (err, replies) => {
        if(replies.length > 0) {
            replies.forEach((reply, index) => {
                reply.content = at.linkUsers(reply.content);
            })
        }
        res.render('reply-list-all', {
            replies: replies
        })
    })
}