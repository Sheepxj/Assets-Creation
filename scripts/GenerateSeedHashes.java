import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Only generates public local-demo hashes; never use this default in production. */
public class GenerateSeedHashes {
    public static void main(String[] args) {
        var encoder = new BCryptPasswordEncoder(10);
        System.out.println("demo_a=" + encoder.encode("Demo123456!"));
        System.out.println("demo_b=" + encoder.encode("Demo123456!"));
    }
}
