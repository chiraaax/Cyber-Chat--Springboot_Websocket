package com.chiran.chat.chat;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;
import java.util.List;
import java.util.ArrayList;

import java.util.concurrent.ConcurrentHashMap;

@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;

    // 👇 Track sessions and usernames per session ID
    private static final Map<String, String> sessionUserMap = new ConcurrentHashMap<>();

    public ChatController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat.sendMessage")
    @SendTo("/topic/public")
    public ChatMessage sendMessage(@Payload ChatMessage chatMessage) {
        return chatMessage;
    }

    @MessageMapping("/chat.addUser")
    public void addUser(@Payload ChatMessage chatMessage, SimpMessageHeaderAccessor headerAccessor) {
        String username = chatMessage.getSender();
        String sessionId = headerAccessor.getSessionId();

        // Store username in session map
        sessionUserMap.put(sessionId, username);

        // Store username in WebSocket session attributes
        headerAccessor.getSessionAttributes().put("username", username);

        // Send join message
        messagingTemplate.convertAndSend("/topic/public", ChatMessage.builder()
                .type(MessageType.JOIN)
                .sender(username)
                .build());

        // Broadcast updated user count
        broadcastUserList();
        broadcastUserCount();
    }

    private void broadcastUserList() {
        List<String> users = new ArrayList<>(sessionUserMap.values());
        messagingTemplate.convertAndSend("/topic/users", users);
    }


    public void removeUser(String sessionId) {
        String username = sessionUserMap.remove(sessionId); // Remove session
        if (username != null) {
            // Send leave message
            messagingTemplate.convertAndSend("/topic/public", ChatMessage.builder()
                    .type(MessageType.LEAVE)
                    .sender(username)
                    .build());

            // Broadcast updated user count
            broadcastUserCount();
            broadcastUserList();
        }
    }

    private void broadcastUserCount() {
        messagingTemplate.convertAndSend("/topic/public", ChatMessage.builder()
                .type(MessageType.USER_COUNT)
                .count(sessionUserMap.size()) // ✅ accurate count
                .build());
    }
}
