package com.sheepxj.assets.auth;

import com.sheepxj.assets.contract.ApiContracts.Credentials;
import com.sheepxj.assets.contract.ApiContracts.UserDto;
import com.sheepxj.assets.security.CurrentUser;
import com.sheepxj.assets.security.SessionLogin;
import com.sheepxj.assets.security.SessionLogout;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final SessionLogin login;
    private final SessionLogout logout;
    private final CurrentUser currentUser;

    public AuthController(AuthService auth, SessionLogin login, SessionLogout logout, CurrentUser currentUser) {
        this.auth = auth;
        this.login = login;
        this.logout = logout;
        this.currentUser = currentUser;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto register(@RequestBody Credentials input, HttpServletRequest request, HttpServletResponse response) {
        var user = auth.register(input);
        login.signIn(user, request, response);
        return new UserDto(user.id(), user.username());
    }

    @PostMapping("/login")
    public UserDto login(@RequestBody Credentials input, HttpServletRequest request, HttpServletResponse response) {
        var user = auth.authenticate(input);
        login.signIn(user, request, response);
        return new UserDto(user.id(), user.username());
    }

    @GetMapping("/me")
    public UserDto me() { return currentUser.require().toDto(); }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response) {
        currentUser.require();
        logout.signOut(request, response);
    }
}
